import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createRequestId } from "@/lib/contracts";
import { generateAnonymousId, generateArtworkPublicId } from "@/lib/domain/formal-identifiers";
import { ANONYMOUS_SYMBOLS } from "@/lib/server/formal-identifiers";
import { hashLocalPassword, validateProtectedAdminInitialPassword } from "@/lib/server/passwords";
import { writeAuditLog } from "@/lib/server/audit";

export const PROTECTED_ADMIN_ACCOUNT_CODE = "SophiaXu";
export const PROTECTED_ADMIN_DISPLAY_NAME = "SophiaXu";
export const PROTECTED_ADMIN_EMAIL = "sophiaxu@moonshotacademy.cn";

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

      const secureCredentialMarker = before
        ? await tx.adminAuditLog.findFirst({
            where: {
              eventId: event.id,
              targetId: before.id,
              action: "PROTECTED_ADMIN_CREDENTIAL_V1_PROVISIONED",
            },
            select: { id: true },
          })
        : null;

      const userSelect = {
        id: true,
        eventId: true,
        accountCode: true,
        displayName: true,
        email: true,
        role: true,
        status: true,
        protectedSystemAdmin: true,
      } as const;
      const user = before
        ? await tx.user.update({
            where: { id: before.id },
            data: {
              displayName: PROTECTED_ADMIN_DISPLAY_NAME,
              displayNameSortKey: "sophiaxu",
              email: PROTECTED_ADMIN_EMAIL,
              role: "ADMIN",
              status: "ACTIVE",
              protectedSystemAdmin: true,
              archivedAt: null,
              archivedBy: null,
            },
            select: userSelect,
          })
        : await tx.user.create({
            data: {
              eventId: event.id,
              accountCode: PROTECTED_ADMIN_ACCOUNT_CODE,
              displayName: PROTECTED_ADMIN_DISPLAY_NAME,
              displayNameSortKey: "sophiaxu",
              email: PROTECTED_ADMIN_EMAIL,
              role: "ADMIN",
              status: "ACTIVE",
              protectedSystemAdmin: true,
              localCredential: {
                create: {
                  passwordHash: hashLocalPassword(
                    validateProtectedAdminInitialPassword(process.env.PROTECTED_ADMIN_INITIAL_PASSWORD),
                  ),
                  passwordChangedAt: new Date(),
                },
              },
            },
            select: userSelect,
          });

      const credential = await tx.localCredential.findUnique({
        where: { userId: user.id },
        select: { passwordChangedAt: true },
      });
      if (!credential) {
        await tx.localCredential.create({
          data: {
            userId: user.id,
            passwordHash: hashLocalPassword(
              validateProtectedAdminInitialPassword(process.env.PROTECTED_ADMIN_INITIAL_PASSWORD),
            ),
            passwordChangedAt: new Date(),
          },
        });
      } else if (before && !secureCredentialMarker) {
        await tx.localCredential.update({
          where: { userId: user.id },
          data: {
            passwordHash: hashLocalPassword(
              validateProtectedAdminInitialPassword(process.env.PROTECTED_ADMIN_INITIAL_PASSWORD),
            ),
            passwordChangedAt: new Date(),
          },
        });
      }
      if (!secureCredentialMarker) {
        if (before) {
          await tx.session.updateMany({
            where: { userId: user.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        await writeAuditLog(tx, {
          eventId: event.id,
          actorUserId: user.id,
          requestId: createRequestId(),
          change: {
            action: "PROTECTED_ADMIN_CREDENTIAL_V1_PROVISIONED",
            targetType: "USER",
            targetId: user.id,
            summary: before
              ? "Protected system administrator credential rotated during secure bootstrap"
              : "Protected system administrator credential provisioned from deployment secret",
          },
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
