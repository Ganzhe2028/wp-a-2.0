import { writeAuditLog } from "@/lib/server/audit";
import { runIdempotentTransaction, type IdempotencyContext } from "@/lib/server/idempotency";
import type { RequestMetadata } from "@/lib/server/request-security";

const BOOLEAN_KEYS = [
  "day1Open",
  "day3Open",
  "authoringEnabled",
  "allowEditing",
  "showName",
  "fullProfileVisible",
  "seniorCanBrowseAll",
] as const;

export type SettingsChanges = Partial<Record<(typeof BOOLEAN_KEYS)[number], boolean>>;

export function parseSettingsChanges(value: unknown): SettingsChanges | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length === 0 || Object.keys(record).some((key) => !BOOLEAN_KEYS.includes(key as never))) return null;
  const changes: SettingsChanges = {};
  for (const key of BOOLEAN_KEYS) {
    if (record[key] !== undefined) {
      if (typeof record[key] !== "boolean") return null;
      changes[key] = record[key] as boolean;
    }
  }
  return changes;
}

export async function updateFormalEventSettings(input: {
  eventId: string;
  actorUserId: string;
  version: number;
  changes: SettingsChanges;
  requestId: string;
  metadata?: RequestMetadata;
  action?: string;
  idempotency: IdempotencyContext;
}) {
  const result = await runIdempotentTransaction(input.idempotency, async (tx) => {
    await tx.$queryRaw`SELECT "eventId" FROM "EventSettings" WHERE "eventId" = ${input.eventId} FOR UPDATE`;
    const before = await tx.eventSettings.findUnique({ where: { eventId: input.eventId } });
    if (!before) throw new Error("SETTINGS_NOT_FOUND");
    if (before.version !== input.version) throw new Error("VERSION_CONFLICT");
    const updated = await tx.eventSettings.update({
      where: { eventId: input.eventId },
      data: { ...input.changes, version: { increment: 1 }, updatedBy: input.actorUserId },
    });
    const beforeAudit = Object.fromEntries(BOOLEAN_KEYS.map((key) => [key, before[key]]));
    const afterAudit = Object.fromEntries(BOOLEAN_KEYS.map((key) => [key, updated[key]]));
    await writeAuditLog(tx, {
      eventId: input.eventId,
      actorUserId: input.actorUserId,
      requestId: input.requestId,
      metadata: input.metadata,
      change: {
        action: input.action || "SETTINGS_UPDATE",
        targetType: "EVENT",
        targetId: input.eventId,
        summary: "Event settings updated",
        before: { ...beforeAudit, version: before.version },
        after: { ...afterAudit, version: updated.version },
      },
    });
    return { settings: updated, before: beforeAudit, after: afterAudit };
  });
  return { ...result.data, replayed: result.replayed };
}
