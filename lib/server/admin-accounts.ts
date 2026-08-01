import { Prisma } from "@/app/generated/prisma/client";
import { csvCell } from "@/lib/csv";
import { generateAnonymousId, generateArtworkPublicId } from "@/lib/domain/formal-identifiers";
import { ANONYMOUS_SYMBOLS, generateAccountCode } from "@/lib/server/formal-identifiers";
import { generateInitialPassword, hashLocalPassword } from "@/lib/server/passwords";
import { writeAuditLog } from "@/lib/server/audit";
import { runIdempotentTransaction, type IdempotencyContext } from "@/lib/server/idempotency";
import type { RequestMetadata } from "@/lib/server/request-security";

export interface ImportAccountRow {
  displayName: string;
  role?: unknown;
}

export interface ImportedCredential {
  userId: string;
  displayName: string;
  accountCode: string;
  initialPassword: string;
}

function normalizeRows(rows: ImportAccountRow[]) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 500) {
    throw new Error("IMPORT_ROWS_INVALID");
  }
  return rows.map((row) => {
    const displayName = typeof row?.displayName === "string" ? row.displayName.trim() : "";
    if (!displayName || Array.from(displayName).length > 80) throw new Error("IMPORT_NAME_INVALID");
    if (row.role !== undefined && row.role !== "LEARNER") throw new Error("IMPORT_ROLE_INVALID");
    return { displayName };
  });
}

async function nextUniqueAccountCode(tx: Prisma.TransactionClient, reserved: Set<string>) {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const accountCode = generateAccountCode();
    if (reserved.has(accountCode)) continue;
    const exists = await tx.user.findUnique({ where: { accountCode }, select: { id: true } });
    if (!exists) {
      reserved.add(accountCode);
      return accountCode;
    }
  }
  throw new Error("ACCOUNT_CODE_GENERATION_EXHAUSTED");
}

export async function importFormalAccounts(input: {
  eventId: string;
  actorUserId: string;
  requestId: string;
  metadata?: RequestMetadata;
  rows: ImportAccountRow[];
  idempotency: IdempotencyContext;
}) {
  const rows = normalizeRows(input.rows);
  const passwords = rows.map(() => generateInitialPassword());
  const result = await runIdempotentTransaction(
    input.idempotency,
    async (tx) => {
      const event = await tx.event.findUnique({ where: { id: input.eventId }, select: { id: true } });
      if (!event) throw new Error("EVENT_NOT_FOUND");
      const reservedCodes = new Set<string>();
      const credentials: ImportedCredential[] = [];

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const initialPassword = passwords[index];
        const accountCode = await nextUniqueAccountCode(tx, reservedCodes);
        const user = await tx.user.create({
          data: {
            eventId: input.eventId,
            accountCode,
            displayName: row.displayName,
            displayNameSortKey: row.displayName.normalize("NFKC").toLocaleLowerCase("zh-CN"),
            role: "LEARNER",
            status: "ACTIVE",
            localCredential: { create: { passwordHash: hashLocalPassword(initialPassword) } },
          },
          select: { id: true },
        });
        const anonymousId = await generateAnonymousId({
          alphabet: ANONYMOUS_SYMBOLS,
          isTaken: async (candidate) =>
            Boolean(
              await tx.eventAnonymousId.findUnique({
                where: { eventId_anonymousId: { eventId: input.eventId, anonymousId: candidate } },
                select: { id: true },
              }),
            ),
        });
        await Promise.all([
          tx.eventAnonymousId.create({
            data: { eventId: input.eventId, userId: user.id, anonymousId },
          }),
          tx.artworkPublicId.create({
            data: { eventId: input.eventId, userId: user.id, publicId: generateArtworkPublicId() },
          }),
          writeAuditLog(tx, {
            eventId: input.eventId,
            actorUserId: input.actorUserId,
            requestId: input.requestId,
            metadata: input.metadata,
            change: {
              action: "ACCOUNT_CREATED",
              targetType: "USER",
              targetId: user.id,
              summary: "Learner account created by batch import",
              after: { role: "LEARNER", status: "ACTIVE" },
            },
          }),
        ]);
        credentials.push({ userId: user.id, displayName: row.displayName, accountCode, initialPassword });
      }

      await writeAuditLog(tx, {
        eventId: input.eventId,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        metadata: input.metadata,
        change: {
          action: "ACCOUNTS_IMPORTED",
          targetType: "EVENT",
          targetId: input.eventId,
          summary: "Accounts imported",
          after: { count: credentials.length },
        },
      });
      return credentials;
    },
  );
  return { credentials: result.data, replayed: result.replayed };
}

export function credentialsToCsv(credentials: ImportedCredential[]): string {
  const rows = credentials.map((item) =>
    [csvCell(item.displayName), csvCell(item.accountCode), csvCell(item.initialPassword)].join(","),
  );
  return ["displayName,accountCode,initialPassword", ...rows].join("\n");
}
