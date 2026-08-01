import { NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { failure, success } from "@/lib/contracts";
import { prisma } from "@/lib/prisma";
import { requireFormalAdmin } from "@/lib/server/admin-request";
import { applyEmailImport, EmailImportConflictError, validateEmailImport, type EmailImportRow } from "@/lib/server/admin-email-import";
import { createIdempotencyContext, runIdempotentTransaction } from "@/lib/server/idempotency";
import { getRequestMetadata } from "@/lib/server/request-security";

export async function POST(request: Request) {
  const context = await requireFormalAdmin(request, { write: true });
  if (!context.ok) return context.response;
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
    if (!Array.isArray(body.rows)) throw new Error("invalid");
  } catch {
    return NextResponse.json(failure("VALIDATION_ERROR", "邮箱 CSV 格式无效", context.requestId), { status: 400 });
  }
  const rows = body.rows as EmailImportRow[];
  try {
    if (body.dryRun === true) {
      const validated = await prisma.$transaction(
        (tx) => validateEmailImport(tx, context.admin.eventId, rows),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return NextResponse.json(success({ valid: true, rowCount: validated.length }, context.requestId), { headers: { "Cache-Control": "no-store" } });
    }
    if (body.confirm !== true) {
      return NextResponse.json(failure("VALIDATION_ERROR", "必须先预检并确认导入", context.requestId), { status: 400 });
    }
    const idempotency = createIdempotencyContext({
      request,
      body,
      eventId: context.admin.eventId,
      actorUserId: context.admin.userId,
      scope: "ADMIN_ACCOUNT_EMAILS_IMPORT",
    });
    const result = await runIdempotentTransaction(idempotency, (tx) => applyEmailImport(tx, {
      eventId: context.admin.eventId,
      actorUserId: context.admin.userId,
      requestId: context.requestId,
      metadata: getRequestMetadata(request),
      rows,
    }));
    return NextResponse.json(success(result.data, context.requestId), {
      headers: { "Cache-Control": "no-store", ...(result.replayed && { "Idempotency-Replayed": "true" }) },
    });
  } catch (error) {
    if (error instanceof EmailImportConflictError) {
      return NextResponse.json(
        failure("VERSION_CONFLICT", "邮箱导入存在冲突，整批未写入", context.requestId, { conflicts: error.conflicts }),
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const message = error instanceof Error ? error.message : "";
    if (message === "IDEMPOTENCY_KEY_INVALID") return NextResponse.json(failure("VALIDATION_ERROR", "Idempotency-Key 无效", context.requestId), { status: 400 });
    if (["IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_EXPIRED"].includes(message)) return NextResponse.json(failure("VERSION_CONFLICT", "重复请求与原始邮箱导入不一致", context.requestId), { status: 409 });
    return NextResponse.json(failure("INTERNAL_ERROR", "邮箱导入失败", context.requestId), { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
