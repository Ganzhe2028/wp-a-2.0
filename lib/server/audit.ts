import type { Prisma } from "@/app/generated/prisma/client";
import { digestSensitive, type RequestMetadata } from "@/lib/server/request-security";

export interface AuditChange {
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

export async function writeAuditLog(
  tx: Prisma.TransactionClient,
  input: {
    eventId: string;
    actorUserId: string | null;
    requestId: string;
    metadata?: RequestMetadata;
    change: AuditChange;
  },
) {
  const { change } = input;
  return tx.adminAuditLog.create({
    data: {
      eventId: input.eventId,
      actorUserId: input.actorUserId,
      action: change.action,
      targetType: change.targetType,
      targetId: digestSensitive(change.targetId),
      summary: change.summary,
      requestId: input.requestId,
      before: change.before,
      after: change.after,
      ipHash: input.metadata?.ipHash,
      userAgentHash: input.metadata?.userAgentHash,
    },
  });
}
