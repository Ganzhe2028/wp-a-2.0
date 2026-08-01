import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { failure, success } from "@/lib/contracts";
import { requireFormalAdmin } from "@/lib/server/admin-request";
import { writeAuditLog } from "@/lib/server/audit";
import { createIdempotencyContext, runIdempotentTransaction } from "@/lib/server/idempotency";
import { getRequestMetadata } from "@/lib/server/request-security";

function normalizeGroupName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().normalize("NFKC");
  return normalized && Array.from(normalized).length <= 80 ? normalized : null;
}

export async function POST(request: Request) {
  const context = await requireFormalAdmin(request, { write: true });
  if (!context.ok) return context.response;
  let body: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
    body = value as Record<string, unknown>;
  } catch {
    return NextResponse.json(failure("VALIDATION_ERROR", "请求格式无效", context.requestId), { status: 400 });
  }
  const name = normalizeGroupName(body.name);
  if (!name || body.confirm !== true) {
    return NextResponse.json(failure("VALIDATION_ERROR", "组名或确认字段无效", context.requestId), { status: 400 });
  }
  try {
    const idempotency = createIdempotencyContext({ request, body, eventId: context.admin.eventId, actorUserId: context.admin.userId, scope: "ADMIN_GROUP_CREATE" });
    const result = await runIdempotentTransaction(idempotency, async (tx) => {
      const duplicate = await tx.group.findFirst({
        where: { eventId: context.admin.eventId, name: { equals: name, mode: "insensitive" } },
        select: { id: true },
      });
      if (duplicate) throw new Error("GROUP_NAME_CONFLICT");
      const group = await tx.group.create({
        data: {
          eventId: context.admin.eventId,
          stableKey: `grp_${randomBytes(10).toString("base64url")}`,
          name,
        },
        select: { id: true, name: true },
      });
      await writeAuditLog(tx, {
        eventId: context.admin.eventId,
        actorUserId: context.admin.userId,
        requestId: context.requestId,
        metadata: getRequestMetadata(request),
        change: {
          action: "GROUP_CREATED",
          targetType: "GROUP",
          targetId: group.id,
          summary: "Group created",
          after: { groupId: group.id },
        },
      });
      return { group: { ...group, memberCount: 0 } };
    });
    return NextResponse.json(success(result.data, context.requestId), { headers: { "Cache-Control": "no-store", ...(result.replayed && { "Idempotency-Replayed": "true" }) } });
  } catch (error) {
    if (error instanceof Error && error.message === "GROUP_NAME_CONFLICT") {
      return NextResponse.json(failure("VALIDATION_ERROR", "同名组别已经存在", context.requestId), { status: 409 });
    }
    if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_INVALID") {
      return NextResponse.json(failure("VALIDATION_ERROR", "Idempotency-Key 无效", context.requestId), { status: 400 });
    }
    if (error instanceof Error && ["IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_EXPIRED"].includes(error.message)) {
      return NextResponse.json(failure("VERSION_CONFLICT", "重复请求与原始操作不一致", context.requestId), { status: 409 });
    }
    return NextResponse.json(failure("INTERNAL_ERROR", "创建组别失败", context.requestId), { status: 500 });
  }
}
