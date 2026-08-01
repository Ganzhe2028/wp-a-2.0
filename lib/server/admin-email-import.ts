import type { Prisma } from "@/app/generated/prisma/client";
import { normalizeAccountCode } from "@/lib/server/formal-identifiers";
import { writeAuditLog } from "@/lib/server/audit";
import type { RequestMetadata } from "@/lib/server/request-security";

export interface EmailImportRow {
  accountCode: string;
  displayName?: string;
  email: string;
}

export interface EmailImportConflict {
  row: number;
  accountCode: string;
  code: "INVALID_ROW" | "DUPLICATE_ACCOUNT" | "DUPLICATE_EMAIL" | "ACCOUNT_NOT_FOUND" | "DISPLAY_NAME_MISMATCH" | "EMAIL_IN_USE" | "PROTECTED_ACCOUNT" | "OIDC_ALREADY_BOUND";
}

export interface NormalizedEmailImportRow {
  row: number;
  accountCode: string;
  displayName: string | null;
  email: string;
}

export class EmailImportConflictError extends Error {
  conflicts: EmailImportConflict[];

  constructor(conflicts: EmailImportConflict[]) {
    super("EMAIL_IMPORT_CONFLICT");
    this.conflicts = conflicts;
  }
}

function normalizeRows(rows: EmailImportRow[]): { rows: NormalizedEmailImportRow[]; conflicts: EmailImportConflict[] } {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 500) {
    return { rows: [], conflicts: [{ row: 0, accountCode: "", code: "INVALID_ROW" }] };
  }
  const normalized: NormalizedEmailImportRow[] = [];
  const conflicts: EmailImportConflict[] = [];
  const accountRows = new Map<string, number[]>();
  const emailRows = new Map<string, number[]>();
  rows.forEach((item, index) => {
    const row = index + 1;
    const accountCode = normalizeAccountCode(typeof item?.accountCode === "string" ? item.accountCode : "");
    const displayName = typeof item?.displayName === "string" && item.displayName.trim()
      ? item.displayName.trim().normalize("NFKC")
      : null;
    const email = typeof item?.email === "string" ? item.email.trim().toLocaleLowerCase("en-US") : "";
    if (
      !accountCode ||
      (displayName !== null && Array.from(displayName).length > 80) ||
      !email ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      conflicts.push({ row, accountCode, code: "INVALID_ROW" });
      return;
    }
    normalized.push({ row, accountCode, displayName, email });
    accountRows.set(accountCode, [...(accountRows.get(accountCode) ?? []), row]);
    emailRows.set(email, [...(emailRows.get(email) ?? []), row]);
  });
  for (const [accountCode, duplicateRows] of accountRows) {
    if (duplicateRows.length > 1) duplicateRows.forEach((row) => conflicts.push({ row, accountCode, code: "DUPLICATE_ACCOUNT" }));
  }
  for (const duplicateRows of emailRows.values()) {
    if (duplicateRows.length > 1) {
      duplicateRows.forEach((row) => {
        const accountCode = normalized.find((item) => item.row === row)?.accountCode ?? "";
        conflicts.push({ row, accountCode, code: "DUPLICATE_EMAIL" });
      });
    }
  }
  return { rows: normalized, conflicts };
}

export async function validateEmailImport(
  tx: Prisma.TransactionClient,
  eventId: string,
  sourceRows: EmailImportRow[],
) {
  const normalized = normalizeRows(sourceRows);
  const conflicts = [...normalized.conflicts];
  if (!normalized.rows.length) throw new EmailImportConflictError(conflicts);
  const [users, emailOwners] = await Promise.all([
    tx.user.findMany({
      where: { eventId, accountCode: { in: normalized.rows.map((row) => row.accountCode) } },
      select: { id: true, accountCode: true, displayName: true, email: true, protectedSystemAdmin: true, oidcIdentities: { select: { id: true }, take: 1 } },
    }),
    tx.user.findMany({
      where: { email: { in: normalized.rows.map((row) => row.email) } },
      select: { id: true, email: true },
    }),
  ]);
  const usersByCode = new Map(users.map((user) => [user.accountCode, user]));
  const ownersByEmail = new Map(emailOwners.flatMap((user) => user.email ? [[user.email.toLocaleLowerCase("en-US"), user]] : []));
  for (const row of normalized.rows) {
    const user = usersByCode.get(row.accountCode);
    if (!user) {
      conflicts.push({ row: row.row, accountCode: row.accountCode, code: "ACCOUNT_NOT_FOUND" });
      continue;
    }
    if (row.displayName !== null && user.displayName.normalize("NFKC") !== row.displayName) {
      conflicts.push({ row: row.row, accountCode: row.accountCode, code: "DISPLAY_NAME_MISMATCH" });
    }
    const currentEmail = user.email?.toLocaleLowerCase("en-US") ?? null;
    if (user.protectedSystemAdmin && currentEmail !== row.email) {
      conflicts.push({ row: row.row, accountCode: row.accountCode, code: "PROTECTED_ACCOUNT" });
    }
    if (user.oidcIdentities.length && currentEmail !== row.email) {
      conflicts.push({ row: row.row, accountCode: row.accountCode, code: "OIDC_ALREADY_BOUND" });
    }
    const owner = ownersByEmail.get(row.email);
    if (owner && owner.id !== user.id) {
      conflicts.push({ row: row.row, accountCode: row.accountCode, code: "EMAIL_IN_USE" });
    }
  }
  if (conflicts.length) throw new EmailImportConflictError(conflicts.sort((a, b) => a.row - b.row || a.code.localeCompare(b.code)));
  return normalized.rows.map((row) => ({ ...row, user: usersByCode.get(row.accountCode)! }));
}

export async function applyEmailImport(
  tx: Prisma.TransactionClient,
  input: {
    eventId: string;
    actorUserId: string;
    requestId: string;
    metadata?: RequestMetadata;
    rows: EmailImportRow[];
  },
) {
  const validated = await validateEmailImport(tx, input.eventId, input.rows);
  let updatedCount = 0;
  for (const row of validated) {
    const currentEmail = row.user.email?.toLocaleLowerCase("en-US") ?? null;
    if (currentEmail === row.email) continue;
    await tx.user.update({ where: { id: row.user.id }, data: { email: row.email, version: { increment: 1 } } });
    await writeAuditLog(tx, {
      eventId: input.eventId,
      actorUserId: input.actorUserId,
      requestId: input.requestId,
      metadata: input.metadata,
      change: {
        action: "ACCOUNT_EMAIL_PROVISIONED",
        targetType: "USER",
        targetId: row.user.id,
        summary: "School email provisioned for account",
        before: { emailProvisioned: Boolean(currentEmail) },
        after: { emailProvisioned: true },
      },
    });
    updatedCount += 1;
  }
  await writeAuditLog(tx, {
    eventId: input.eventId,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    metadata: input.metadata,
    change: {
      action: "ACCOUNT_EMAILS_IMPORTED",
      targetType: "EVENT",
      targetId: input.eventId,
      summary: "School email import completed",
      after: { rowCount: validated.length, updatedCount },
    },
  });
  return { rowCount: validated.length, updatedCount, unchangedCount: validated.length - updatedCount };
}
