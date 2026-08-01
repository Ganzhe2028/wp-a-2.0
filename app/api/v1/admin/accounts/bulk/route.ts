import { NextResponse } from "next/server";
import { failure, success } from "@/lib/contracts";
import { requireFormalAdmin } from "@/lib/server/admin-request";
import { writeAuditLog } from "@/lib/server/audit";
import { credentialsToCsv } from "@/lib/server/admin-accounts";
import { generateInitialPassword, hashLocalPassword } from "@/lib/server/passwords";
import { getRequestMetadata } from "@/lib/server/request-security";
import { createIdempotencyContext, runIdempotentTransaction } from "@/lib/server/idempotency";

type BulkOperation = "SET_ROLE" | "SET_GROUP" | "ARCHIVE" | "ACTIVATE" | "RESET_PASSWORDS";

export async function POST(request: Request) {
  const context = await requireFormalAdmin(request, { write: true });
  if (!context.ok) return context.response;
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(failure("VALIDATION_ERROR", "请求格式无效", context.requestId), { status: 400 });
  }
  const accountIds = Array.isArray(body.accountIds)
    ? [...new Set(body.accountIds.filter((id): id is string => typeof id === "string" && Boolean(id)))]
    : [];
  const operation = body.operation as BulkOperation;
  const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
    ? body.payload as Record<string, unknown>
    : {};
  if (!accountIds.length || accountIds.length > 500 || body.confirm !== true || !["SET_ROLE", "SET_GROUP", "ARCHIVE", "ACTIVATE", "RESET_PASSWORDS"].includes(operation)) {
    return NextResponse.json(failure("VALIDATION_ERROR", "批量操作参数无效", context.requestId), { status: 400 });
  }
  if (operation === "SET_ROLE" && !["LEARNER", "SENIOR", "ADMIN"].includes(String(payload.role))) {
    return NextResponse.json(failure("VALIDATION_ERROR", "角色无效", context.requestId), { status: 400 });
  }
  try {
    const idempotency = createIdempotencyContext({ request, body, eventId: context.admin.eventId, actorUserId: context.admin.userId, scope: "ADMIN_ACCOUNTS_BULK" });
    const execution = await runIdempotentTransaction(idempotency, async (tx) => {
      const generatedPasswords = new Map(accountIds.map((id) => [id, generateInitialPassword()]));
      const targets = await tx.user.findMany({
        where: { id: { in: accountIds }, eventId: context.admin.eventId },
        select: { id: true, displayName: true, accountCode: true, role: true, status: true, protectedSystemAdmin: true },
      });
      if (targets.length !== accountIds.length) throw new Error("ACCOUNT_NOT_FOUND");
      const eligible = targets.filter((target) => !target.protectedSystemAdmin);
      const excludedAccountIds = targets.filter((target) => target.protectedSystemAdmin).map((target) => target.id);
      const activeAdminsRemoved = eligible.filter(
        (target) => target.role === "ADMIN" && target.status === "ACTIVE" &&
          (operation === "ARCHIVE" || operation === "SET_ROLE" && payload.role !== "ADMIN"),
      ).length;
      if (activeAdminsRemoved) {
        const activeAdmins = await tx.user.count({ where: { eventId: context.admin.eventId, role: "ADMIN", status: "ACTIVE" } });
        if (activeAdmins - activeAdminsRemoved < 1) throw new Error("LAST_ADMIN");
      }
      if (operation === "SET_GROUP" && payload.groupId !== null) {
        if (typeof payload.groupId !== "string") throw new Error("GROUP_NOT_FOUND");
        const group = await tx.group.findFirst({ where: { id: payload.groupId, eventId: context.admin.eventId } });
        if (!group) throw new Error("GROUP_NOT_FOUND");
      }

      const credentials = [];
      for (const target of eligible) {
        if (operation === "RESET_PASSWORDS") {
          const initialPassword = generatedPasswords.get(target.id)!;
          const passwordHash = hashLocalPassword(initialPassword);
          await tx.localCredential.upsert({
            where: { userId: target.id },
            update: { passwordHash, passwordChangedAt: new Date() },
            create: { userId: target.id, passwordHash },
          });
          credentials.push({ userId: target.id, displayName: target.displayName, accountCode: target.accountCode, initialPassword });
        } else {
          await tx.user.update({
            where: { id: target.id },
            data: {
              ...(operation === "SET_ROLE" && { role: payload.role as "LEARNER" | "SENIOR" | "ADMIN" }),
              ...(operation === "SET_GROUP" && { groupId: payload.groupId as string | null }),
              ...(operation === "ARCHIVE" && { status: "ARCHIVED", archivedAt: new Date(), archivedBy: context.admin.userId }),
              ...(operation === "ACTIVATE" && { status: "ACTIVE", archivedAt: null, archivedBy: null }),
              version: { increment: 1 },
            },
          });
        }
        if (operation !== "SET_GROUP") {
          await tx.session.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
        }
      }
      await writeAuditLog(tx, {
        eventId: context.admin.eventId,
        actorUserId: context.admin.userId,
        requestId: context.requestId,
        metadata: getRequestMetadata(request),
        change: {
          action: `ACCOUNTS_BULK_${operation}`,
          targetType: "USER_BATCH",
          targetId: accountIds.join(","),
          summary: "Bulk account operation completed",
          after: { operation, affectedCount: eligible.length, excludedProtectedCount: excludedAccountIds.length },
        },
      });
      return { affectedCount: eligible.length, excludedAccountIds, credentials };
    });
    const result = execution.data;
    const results = accountIds.map((accountId) => ({
      accountId,
      ok: !result.excludedAccountIds.includes(accountId),
      ...(result.excludedAccountIds.includes(accountId) && { message: "受保护系统 Admin 已自动排除" }),
    }));
    return NextResponse.json(
      success(
        {
          ...result,
          succeeded: result.affectedCount,
          failed: result.excludedAccountIds.length,
          results,
          ...(result.credentials.length > 0 && { credentialsCsv: credentialsToCsv(result.credentials) }),
        },
        context.requestId,
      ),
      { headers: { "Cache-Control": "no-store", Pragma: "no-cache", ...(execution.replayed && { "Idempotency-Replayed": "true" }) } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "IDEMPOTENCY_KEY_INVALID") return NextResponse.json(failure("VALIDATION_ERROR", "Idempotency-Key 无效", context.requestId), { status: 400 });
    if (["IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_EXPIRED"].includes(message)) return NextResponse.json(failure("VERSION_CONFLICT", "重复请求与原始批量操作不一致", context.requestId), { status: 409 });
    const validation = message === "ACCOUNT_NOT_FOUND" || message === "GROUP_NOT_FOUND";
    const forbidden = message === "LAST_ADMIN";
    return NextResponse.json(
      failure(forbidden ? "FORBIDDEN" : validation ? "VALIDATION_ERROR" : "INTERNAL_ERROR", forbidden ? "不能移除最后一个有效管理员" : validation ? "账号或组别不存在" : "批量操作失败", context.requestId),
      { status: forbidden ? 403 : validation ? 400 : 500 },
    );
  }
}
