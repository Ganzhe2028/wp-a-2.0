import { NextResponse } from "next/server";
import { failure, success } from "@/lib/contracts";
import { requireFormalAdmin } from "@/lib/server/admin-request";
import { credentialsToCsv, importFormalAccounts } from "@/lib/server/admin-accounts";
import { getRequestMetadata } from "@/lib/server/request-security";
import { createIdempotencyContext } from "@/lib/server/idempotency";

export async function POST(request: Request) {
  const context = await requireFormalAdmin(request, { write: true });
  if (!context.ok) return context.response;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid");
    const rows = (body as { rows?: unknown }).rows;
    if (!Array.isArray(rows)) throw new Error("invalid");
    const idempotency = createIdempotencyContext({ request, body, eventId: context.admin.eventId, actorUserId: context.admin.userId, scope: "ADMIN_ACCOUNTS_IMPORT" });
    const imported = await importFormalAccounts({
      eventId: context.admin.eventId,
      actorUserId: context.admin.userId,
      requestId: context.requestId,
      metadata: getRequestMetadata(request),
      rows: rows as never[],
      idempotency,
    });
    const credentials = imported.credentials;
    return NextResponse.json(
      success(
        {
          credentials: credentials.map((credential) => ({
            displayName: credential.displayName,
            accountCode: credential.accountCode,
            initialPassword: credential.initialPassword,
          })),
          createdCount: credentials.length,
          credentialsCsv: credentialsToCsv(credentials),
        },
        context.requestId,
      ),
      { headers: { "Cache-Control": "no-store", Pragma: "no-cache", ...(imported.replayed && { "Idempotency-Replayed": "true" }) } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_INVALID") {
      return NextResponse.json(failure("VALIDATION_ERROR", "Idempotency-Key 无效", context.requestId), { status: 400 });
    }
    if (error instanceof Error && ["IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_EXPIRED"].includes(error.message)) {
      return NextResponse.json(failure("VERSION_CONFLICT", "重复请求与原始导入不一致", context.requestId), { status: 409 });
    }
    const known = error instanceof Error && error.message.startsWith("IMPORT_");
    return NextResponse.json(
      failure(known ? "VALIDATION_ERROR" : "INTERNAL_ERROR", known ? "导入数据无效" : "导入失败", context.requestId),
      { status: known ? 400 : 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
