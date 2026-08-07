import { NextResponse } from "next/server";
import { failure, success } from "@/lib/contracts";
import { requireFormalAdmin } from "@/lib/server/admin-request";
import { writeAuditLog } from "@/lib/server/audit";
import { getRequestMetadata } from "@/lib/server/request-security";
import { createIdempotencyContext, runIdempotentTransaction } from "@/lib/server/idempotency";

interface RouteContext { params: Promise<{ id: string }> }

export async function PATCH(request: Request, routeContext: RouteContext) {
  const context = await requireFormalAdmin(request, { write: true });
  if (!context.ok) return context.response;
  const { id } = await routeContext.params;
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(failure("VALIDATION_ERROR", "请求格式无效", context.requestId), { status: 400 });
  }

  const changes = body.changes && typeof body.changes === "object" && !Array.isArray(body.changes)
    ? body.changes as Record<string, unknown>
    : body;
  const version = body.version;
  if (!Number.isSafeInteger(version)) {
    return NextResponse.json(failure("VALIDATION_ERROR", "缺少有效 version", context.requestId), { status: 400 });
  }
  const role = changes.role;
  const status = changes.status;
  const displayName = changes.displayName;
  const groupId = changes.groupId;
  if (role !== undefined && role !== "LEARNER" && role !== "SENIOR" && role !== "ADMIN") {
    return NextResponse.json(failure("VALIDATION_ERROR", "角色无效", context.requestId), { status: 400 });
  }
  if (status !== undefined && status !== "ACTIVE" && status !== "ARCHIVED") {
    return NextResponse.json(failure("VALIDATION_ERROR", "账号状态无效", context.requestId), { status: 400 });
  }
  if (displayName !== undefined && (typeof displayName !== "string" || !displayName.trim() || Array.from(displayName.trim()).length > 80)) {
    return NextResponse.json(failure("VALIDATION_ERROR", "姓名无效", context.requestId), { status: 400 });
  }
  if (groupId !== undefined && groupId !== null && typeof groupId !== "string") {
    return NextResponse.json(failure("VALIDATION_ERROR", "组别无效", context.requestId), { status: 400 });
  }

  try {
    const idempotency = createIdempotencyContext({ request, body, eventId: context.admin.eventId, actorUserId: context.admin.userId, scope: `ADMIN_ACCOUNT_PATCH:${id}` });
    const result = await runIdempotentTransaction(idempotency, async (tx) => {
      const existing = await tx.user.findFirst({ where: { id, eventId: context.admin.eventId } });
      if (!existing) throw new Error("NOT_FOUND");
      if (existing.protectedSystemAdmin && (role !== undefined || status !== undefined || displayName !== undefined || groupId !== undefined)) {
        throw new Error("PROTECTED_ACCOUNT");
      }
      const removesAdmin = existing.role === "ADMIN" && (role !== undefined && role !== "ADMIN" || status === "ARCHIVED");
      if (removesAdmin) {
        const admins = await tx.user.count({ where: { eventId: existing.eventId, role: "ADMIN", status: "ACTIVE" } });
        if (admins <= 1) throw new Error("LAST_ADMIN");
      }
      if (typeof groupId === "string") {
        const group = await tx.group.findFirst({ where: { id: groupId, eventId: existing.eventId } });
        if (!group) throw new Error("GROUP_NOT_FOUND");
      }
      const updated = await tx.user.updateMany({
        where: { id, eventId: existing.eventId, version: version as number },
        data: {
          ...(typeof displayName === "string" && {
            displayName: displayName.trim(),
            displayNameSortKey: displayName.trim().normalize("NFKC").toLocaleLowerCase("zh-CN"),
          }),
          ...(role !== undefined && { role }),
          ...(status !== undefined && {
            status,
            archivedAt: status === "ARCHIVED" ? new Date() : null,
            archivedBy: status === "ARCHIVED" ? context.admin.userId : null,
          }),
          ...(groupId !== undefined && { groupId }),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new Error("VERSION_CONFLICT");
      if (role !== undefined || status !== undefined) {
        await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      const result = await tx.user.findUniqueOrThrow({
        where: { id },
        select: { id: true, accountCode: true, displayName: true, displayNameSortKey: true, role: true, status: true, groupId: true, version: true, protectedSystemAdmin: true, updatedAt: true },
      });
      await writeAuditLog(tx, {
        eventId: existing.eventId,
        actorUserId: context.admin.userId,
        requestId: context.requestId,
        metadata: getRequestMetadata(request),
        change: {
          action: "ACCOUNT_UPDATED",
          targetType: "USER",
          targetId: id,
          summary: "Account fields updated",
          before: { role: existing.role, status: existing.status, groupId: existing.groupId, version: existing.version, displayName: existing.displayName, displayNameSortKey: existing.displayNameSortKey },
          after: { role: result.role, status: result.status, groupId: result.groupId, version: result.version, displayName: result.displayName, displayNameSortKey: result.displayNameSortKey },
        },
      });
      return result;
    });
    return NextResponse.json(success({ account: result.data }, context.requestId), { headers: { "Cache-Control": "no-store", ...(result.replayed && { "Idempotency-Replayed": "true" }) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "IDEMPOTENCY_KEY_INVALID") return NextResponse.json(failure("VALIDATION_ERROR", "Idempotency-Key 无效", context.requestId), { status: 400 });
    if (["IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_EXPIRED"].includes(message)) return NextResponse.json(failure("VERSION_CONFLICT", "重复请求与原始账号更新不一致", context.requestId), { status: 409 });
    if (message === "NOT_FOUND") return NextResponse.json(failure("FORBIDDEN", "账号不存在", context.requestId), { status: 404 });
    if (message === "VERSION_CONFLICT") return NextResponse.json(failure("VERSION_CONFLICT", "账号已被其他管理员修改", context.requestId), { status: 409 });
    if (message === "PROTECTED_ACCOUNT" || message === "LAST_ADMIN") return NextResponse.json(failure("FORBIDDEN", "受保护账号或最后一个管理员不能执行此操作", context.requestId), { status: 403 });
    if (message === "GROUP_NOT_FOUND") return NextResponse.json(failure("VALIDATION_ERROR", "组别不存在", context.requestId), { status: 400 });
    return NextResponse.json(failure("INTERNAL_ERROR", "账号更新失败", context.requestId), { status: 500 });
  }
}
