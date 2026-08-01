import { NextResponse } from "next/server";
import { failure, success } from "@/lib/contracts";
import { resolveEventPreset } from "@/lib/domain/presets";
import { requireFormalAdmin } from "@/lib/server/admin-request";
import { updateFormalEventSettings } from "@/lib/server/event-settings-admin";
import { getRequestMetadata } from "@/lib/server/request-security";
import { createIdempotencyContext } from "@/lib/server/idempotency";

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
  const changes = resolveEventPreset(body.preset);
  if (!Number.isSafeInteger(body.version) || body.confirm !== true || !changes) {
    return NextResponse.json(failure("VALIDATION_ERROR", "预设、version 或 confirm 无效", context.requestId), { status: 400 });
  }
  try {
    const idempotency = createIdempotencyContext({ request, body, eventId: context.admin.eventId, actorUserId: context.admin.userId, scope: "ADMIN_SETTINGS_PRESET" });
    const result = await updateFormalEventSettings({
      eventId: context.admin.eventId,
      actorUserId: context.admin.userId,
      version: body.version as number,
      changes: { ...changes },
      requestId: context.requestId,
      metadata: getRequestMetadata(request),
      action: "SETTINGS_PRESET_APPLIED",
      idempotency,
    });
    return NextResponse.json(success({ preset: body.preset, ...result }, context.requestId), { headers: { "Cache-Control": "no-store", ...(result.replayed && { "Idempotency-Replayed": "true" }) } });
  } catch (error) {
    const conflict = error instanceof Error && ["VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_EXPIRED"].includes(error.message);
    const invalid = error instanceof Error && error.message === "IDEMPOTENCY_KEY_INVALID";
    if (invalid) return NextResponse.json(failure("VALIDATION_ERROR", "Idempotency-Key 无效", context.requestId), { status: 400 });
    return NextResponse.json(failure(conflict ? "VERSION_CONFLICT" : "INTERNAL_ERROR", conflict ? "设置已被其他管理员修改" : "预设应用失败", context.requestId), { status: conflict ? 409 : 500 });
  }
}
