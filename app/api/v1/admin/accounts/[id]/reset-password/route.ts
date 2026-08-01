import { NextResponse } from "next/server";
import { failure, success } from "@/lib/contracts";
import { requireFormalAdmin } from "@/lib/server/admin-request";
import { writeAuditLog } from "@/lib/server/audit";
import { generateInitialPassword, hashLocalPassword } from "@/lib/server/passwords";
import { getRequestMetadata } from "@/lib/server/request-security";
import { createIdempotencyContext, runIdempotentTransaction } from "@/lib/server/idempotency";

interface RouteContext { params: Promise<{ id: string }> }

export async function POST(request: Request, routeContext: RouteContext) {
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
  if (!Number.isSafeInteger(body.version) || body.confirm !== true) {
    return NextResponse.json(failure("VALIDATION_ERROR", "version 或 confirm 无效", context.requestId), { status: 400 });
  }
  try {
    const idempotency = createIdempotencyContext({ request, body, eventId: context.admin.eventId, actorUserId: context.admin.userId, scope: `ADMIN_PASSWORD_RESET:${id}` });
    const result = await runIdempotentTransaction(idempotency, async (tx) => {
      const target = await tx.user.findFirst({ where: { id, eventId: context.admin.eventId }, select: { id: true, displayName: true, accountCode: true, protectedSystemAdmin: true, version: true } });
      if (!target) throw new Error("NOT_FOUND");
      if (target.protectedSystemAdmin) throw new Error("PROTECTED_ACCOUNT");
      if (target.version !== body.version) throw new Error("VERSION_CONFLICT");
      const initialPassword = generateInitialPassword();
      await tx.localCredential.upsert({
        where: { userId: id },
        update: { passwordHash: hashLocalPassword(initialPassword), passwordChangedAt: new Date() },
        create: { userId: id, passwordHash: hashLocalPassword(initialPassword) },
      });
      await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await writeAuditLog(tx, {
        eventId: context.admin.eventId,
        actorUserId: context.admin.userId,
        requestId: context.requestId,
        metadata: getRequestMetadata(request),
        change: { action: "PASSWORD_RESET", targetType: "USER", targetId: id, summary: "Local password reset and sessions revoked" },
      });
      return { displayName: target.displayName, accountCode: target.accountCode, initialPassword };
    });
    const credential = result.data;
    return NextResponse.json(success({ credential, accountCode: credential.accountCode, initialPassword: credential.initialPassword }, context.requestId), { headers: { "Cache-Control": "no-store", Pragma: "no-cache", ...(result.replayed && { "Idempotency-Replayed": "true" }) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "IDEMPOTENCY_KEY_INVALID") return NextResponse.json(failure("VALIDATION_ERROR", "Idempotency-Key 无效", context.requestId), { status: 400 });
    if (["VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_EXPIRED"].includes(message)) return NextResponse.json(failure("VERSION_CONFLICT", "账号或重复请求版本冲突", context.requestId), { status: 409 });
    const status = message === "NOT_FOUND" ? 404 : message === "PROTECTED_ACCOUNT" ? 403 : 500;
    const code = message === "PROTECTED_ACCOUNT" ? "FORBIDDEN" : message === "NOT_FOUND" ? "FORBIDDEN" : "INTERNAL_ERROR";
    return NextResponse.json(failure(code, message === "PROTECTED_ACCOUNT" ? "受保护 Admin 不可重置密码" : "密码重置失败", context.requestId), { status });
  }
}
