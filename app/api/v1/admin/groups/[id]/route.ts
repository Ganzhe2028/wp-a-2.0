import { NextResponse } from "next/server";
import { failure, success } from "@/lib/contracts";
import { requireFormalAdmin } from "@/lib/server/admin-request";
import { writeAuditLog } from "@/lib/server/audit";
import { createIdempotencyContext, runIdempotentTransaction } from "@/lib/server/idempotency";
import { getRequestMetadata } from "@/lib/server/request-security";

interface RouteContext { params: Promise<{ id: string }> }

function normalizeGroupName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().normalize("NFKC");
  return normalized && Array.from(normalized).length <= 80 ? normalized : null;
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function writeFailure(error: unknown, requestId: string) {
  const message = error instanceof Error ? error.message : "";
  if (message === "GROUP_NOT_FOUND") return NextResponse.json(failure("VALIDATION_ERROR", "组别不存在", requestId), { status: 404 });
  if (message === "GROUP_NAME_CONFLICT") return NextResponse.json(failure("VALIDATION_ERROR", "同名组别已经存在", requestId), { status: 409 });
  if (message === "IDEMPOTENCY_KEY_INVALID") return NextResponse.json(failure("VALIDATION_ERROR", "Idempotency-Key 无效", requestId), { status: 400 });
  if (["IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_EXPIRED"].includes(message)) return NextResponse.json(failure("VERSION_CONFLICT", "重复请求与原始操作不一致", requestId), { status: 409 });
  return NextResponse.json(failure("INTERNAL_ERROR", "组别操作失败", requestId), { status: 500 });
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  const context = await requireFormalAdmin(request, { write: true });
  if (!context.ok) return context.response;
  const body = await readBody(request);
  const name = normalizeGroupName(body?.name);
  if (!body || !name || body.confirm !== true) return NextResponse.json(failure("VALIDATION_ERROR", "组名或确认字段无效", context.requestId), { status: 400 });
  const { id } = await routeContext.params;
  try {
    const idempotency = createIdempotencyContext({ request, body, eventId: context.admin.eventId, actorUserId: context.admin.userId, scope: `ADMIN_GROUP_RENAME:${id}` });
    const result = await runIdempotentTransaction(idempotency, async (tx) => {
      const existing = await tx.group.findFirst({ where: { id, eventId: context.admin.eventId }, select: { id: true, name: true } });
      if (!existing) throw new Error("GROUP_NOT_FOUND");
      const duplicate = await tx.group.findFirst({ where: { eventId: context.admin.eventId, id: { not: id }, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
      if (duplicate) throw new Error("GROUP_NAME_CONFLICT");
      const group = await tx.group.update({ where: { id }, data: { name }, select: { id: true, name: true, _count: { select: { users: { where: { status: "ACTIVE" } } } } } });
      await writeAuditLog(tx, { eventId: context.admin.eventId, actorUserId: context.admin.userId, requestId: context.requestId, metadata: getRequestMetadata(request), change: { action: "GROUP_RENAMED", targetType: "GROUP", targetId: id, summary: "Group renamed", before: { groupId: id }, after: { groupId: id } } });
      return { group: { id: group.id, name: group.name, memberCount: group._count.users } };
    });
    return NextResponse.json(success(result.data, context.requestId), { headers: { "Cache-Control": "no-store", ...(result.replayed && { "Idempotency-Replayed": "true" }) } });
  } catch (error) {
    return writeFailure(error, context.requestId);
  }
}

export async function DELETE(request: Request, routeContext: RouteContext) {
  const context = await requireFormalAdmin(request, { write: true });
  if (!context.ok) return context.response;
  const body = await readBody(request);
  if (!body || body.confirm !== true) return NextResponse.json(failure("VALIDATION_ERROR", "必须明确确认删除组别", context.requestId), { status: 400 });
  const { id } = await routeContext.params;
  try {
    const idempotency = createIdempotencyContext({ request, body, eventId: context.admin.eventId, actorUserId: context.admin.userId, scope: `ADMIN_GROUP_DELETE:${id}` });
    const result = await runIdempotentTransaction(idempotency, async (tx) => {
      const existing = await tx.group.findFirst({ where: { id, eventId: context.admin.eventId }, select: { id: true, _count: { select: { users: true } } } });
      if (!existing) throw new Error("GROUP_NOT_FOUND");
      await tx.user.updateMany({ where: { eventId: context.admin.eventId, groupId: id }, data: { groupId: null, version: { increment: 1 } } });
      await tx.group.delete({ where: { id } });
      await writeAuditLog(tx, { eventId: context.admin.eventId, actorUserId: context.admin.userId, requestId: context.requestId, metadata: getRequestMetadata(request), change: { action: "GROUP_DELETED", targetType: "GROUP", targetId: id, summary: "Group deleted and members unassigned", before: { groupId: id, memberCount: existing._count.users }, after: { deleted: true, memberCount: 0 } } });
      return { deletedGroupId: id, unassignedAccountCount: existing._count.users };
    });
    return NextResponse.json(success(result.data, context.requestId), { headers: { "Cache-Control": "no-store", ...(result.replayed && { "Idempotency-Replayed": "true" }) } });
  } catch (error) {
    return writeFailure(error, context.requestId);
  }
}
