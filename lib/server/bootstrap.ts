import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createRequestId } from "@/lib/contracts";
import { generateAnonymousId, generateArtworkPublicId } from "@/lib/domain/formal-identifiers";
import { ANONYMOUS_SYMBOLS } from "@/lib/server/formal-identifiers";
import { hashLocalPassword } from "@/lib/server/passwords";
import { writeAuditLog } from "@/lib/server/audit";

export const PROTECTED_ADMIN_ACCOUNT_CODE = "SophiaXu";
export const PROTECTED_ADMIN_DISPLAY_NAME = "SophiaXu";
export const PROTECTED_ADMIN_EMAIL = "sophiaxu@moonshotacademy.cn";
export const PROTECTED_ADMIN_INITIAL_PASSWORD = "12138";

export function getDefaultEventKey(): string {
  return process.env.OWEEK_EVENT_KEY?.trim() || process.env.DEFAULT_EVENT_KEY?.trim() || "oweek-2026";
}

export async function ensureProtectedAdmin() {
  return prisma.$transaction(
    async (tx) => {
      const event = await tx.event.upsert({
        where: { eventKey: getDefaultEventKey() },
        update: {},
        create: {
          eventKey: getDefaultEventKey(),
          name: process.env.OWEEK_EVENT_NAME?.trim() || process.env.DEFAULT_EVENT_NAME?.trim() || "O-Week 2026",
          settings: {
            create: {
              day1Open: false,
              day3Open: false,
              authoringEnabled: false,
              allowEditing: false,
              showName: true,
              fullProfileVisible: true,
              seniorCanBrowseAll: false,
            },
          },
        },
      });

      const before = await tx.user.findUnique({
        where: { accountCode: PROTECTED_ADMIN_ACCOUNT_CODE },
        select: { id: true, eventId: true, protectedSystemAdmin: true },
      });

      if (before && before.eventId !== event.id) {
        throw new Error("PROTECTED_ADMIN_EVENT_CONFLICT");
      }

      const user = await tx.user.upsert({
        where: { accountCode: PROTECTED_ADMIN_ACCOUNT_CODE },
        update: {
          displayName: PROTECTED_ADMIN_DISPLAY_NAME,
          displayNameSortKey: "sophiaxu",
          email: PROTECTED_ADMIN_EMAIL,
          role: "ADMIN",
          status: "ACTIVE",
          protectedSystemAdmin: true,
          archivedAt: null,
          archivedBy: null,
        },
        create: {
          eventId: event.id,
          accountCode: PROTECTED_ADMIN_ACCOUNT_CODE,
          displayName: PROTECTED_ADMIN_DISPLAY_NAME,
          displayNameSortKey: "sophiaxu",
          email: PROTECTED_ADMIN_EMAIL,
          role: "ADMIN",
          status: "ACTIVE",
          protectedSystemAdmin: true,
          localCredential: {
            create: { passwordHash: hashLocalPassword(PROTECTED_ADMIN_INITIAL_PASSWORD) },
          },
        },
        select: {
          id: true,
          eventId: true,
          accountCode: true,
          displayName: true,
          email: true,
          role: true,
          status: true,
          protectedSystemAdmin: true,
        },
      });

      const credential = await tx.localCredential.findUnique({ where: { userId: user.id } });
      if (!credential) {
        await tx.localCredential.create({
          data: { userId: user.id, passwordHash: hashLocalPassword(PROTECTED_ADMIN_INITIAL_PASSWORD) },
        });
      }

      const anonymous = await tx.eventAnonymousId.findUnique({
        where: { eventId_userId: { eventId: event.id, userId: user.id } },
      });
      if (!anonymous) {
        const anonymousId = await generateAnonymousId({
          alphabet: ANONYMOUS_SYMBOLS,
          isTaken: async (candidate) =>
            Boolean(
              await tx.eventAnonymousId.findUnique({
                where: { eventId_anonymousId: { eventId: event.id, anonymousId: candidate } },
                select: { id: true },
              }),
            ),
        });
        await tx.eventAnonymousId.create({
          data: { eventId: event.id, userId: user.id, anonymousId },
        });
      }

      const publicAddress = await tx.artworkPublicId.findFirst({
        where: { eventId: event.id, userId: user.id, revokedAt: null },
      });
      if (!publicAddress) {
        await tx.artworkPublicId.create({
          data: { eventId: event.id, userId: user.id, publicId: generateArtworkPublicId() },
        });
      }

      if (!before) {
        await writeAuditLog(tx, {
          eventId: event.id,
          actorUserId: user.id,
          requestId: createRequestId(),
          change: {
            action: "SYSTEM_ADMIN_ENSURED",
            targetType: "USER",
            targetId: user.id,
            summary: "Protected system administrator created",
            after: { role: "ADMIN", status: "ACTIVE", protectedSystemAdmin: true },
          },
        });
      }

      return { event, user };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
