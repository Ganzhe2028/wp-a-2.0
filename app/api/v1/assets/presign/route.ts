import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { failure, success } from "@/lib/contracts";
import { prisma } from "@/lib/prisma";
import { requireFormalViewer } from "@/lib/server/student-request";
import { decideAuthoring } from "@/lib/domain/authoring";
import { createPresignedUploadUrl } from "@/lib/r2";
import { createIdempotencyContext, runIdempotentTransaction } from "@/lib/server/idempotency";
import { consumePersistentRateLimit } from "@/lib/server/persistent-rate-limit";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_UPLOAD_BYTES = 512 * 1024;
const MAX_TOTAL_ASSETS = 2_250;

function validationFailure(requestId: string, reason: string, message: string) {
  console.warn("asset presign rejected", { requestId, reason });
  return NextResponse.json(failure("VALIDATION_ERROR", message, requestId), { status: 400 });
}

export async function POST(request: Request) {
  const context = await requireFormalViewer(request, { write: true });
  if (!context.ok) return context.response;
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(failure("VALIDATION_ERROR", "请求格式无效", context.requestId), { status: 400 });
  }
  if (body.section !== "DAY1") return validationFailure(context.requestId, "SECTION", "图片上传分区无效");
  if (typeof body.mimeType !== "string" || !ALLOWED_MIME.has(body.mimeType)) return validationFailure(context.requestId, "MIME", "当前浏览器生成的图片格式不受支持，请重试");
  if (!Number.isSafeInteger(body.byteSize) || (body.byteSize as number) <= 0) return validationFailure(context.requestId, "BYTE_SIZE", "压缩后的图片大小无效，请重试");
  if ((body.byteSize as number) > MAX_UPLOAD_BYTES) return validationFailure(context.requestId, "TOO_LARGE", "图片压缩后仍然过大，请换一张图片");
  if (typeof body.checksum !== "string" || !/^[0-9a-f]{64}$/i.test(body.checksum)) return validationFailure(context.requestId, "CHECKSUM", "图片校验失败，请重试");
  const [settings, submission] = await Promise.all([
    prisma.eventSettings.findUnique({ where: { eventId: context.viewer.eventId } }),
    prisma.submission.findUnique({ where: { eventId_userId_section: { eventId: context.viewer.eventId, userId: context.viewer.userId, section: "DAY1" } }, select: { status: true } }),
  ]);
  const authoring = decideAuthoring({ role: context.viewer.role, section: "DAY1", status: submission?.status ?? "NOT_STARTED", settings });
  if (!authoring.allowed) return NextResponse.json(failure(authoring.code, "当前不可上传", context.requestId), { status: 403 });
  let rateLimit;
  try {
    rateLimit = await consumePersistentRateLimit({ scope: "ASSET_PRESIGN", identity: context.viewer.userId, limit: 100, windowMs: 15 * 60 * 1000 });
  } catch {
    return NextResponse.json(failure("INTERNAL_ERROR", "上传服务暂时不可用", context.requestId), { status: 500 });
  }
  if (!rateLimit.allowed) return NextResponse.json(failure("RATE_LIMITED", "上传请求过于频繁", context.requestId), { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  try {
    const idempotency = createIdempotencyContext({ request, body, eventId: context.viewer.eventId, actorUserId: context.viewer.userId, scope: "ASSET_PRESIGN:DAY1" });
    const totalAssets = await prisma.asset.count();
    if (totalAssets >= MAX_TOTAL_ASSETS) throw new Error("GLOBAL_ASSET_LIMIT");
    const assetId = randomUUID();
    const extension = body.mimeType === "image/jpeg" ? "jpg" : (body.mimeType as string).split("/")[1];
    const storageKey = `incoming/${context.viewer.eventId}/${context.viewer.userId}/${assetId}.${extension}`;
    const uploadUrl = await createPresignedUploadUrl(storageKey, body.mimeType as string, body.byteSize as number);
    const result = await runIdempotentTransaction(idempotency, async (tx) => {
      await tx.asset.create({
        data: {
          id: assetId,
          eventId: context.viewer.eventId,
          ownerUserId: context.viewer.userId,
          storageKey,
          mimeType: body.mimeType as string,
          byteSize: BigInt(body.byteSize as number),
          checksum: (body.checksum as string).toLowerCase(),
          scanStatus: "PENDING",
          processingStatus: "UPLOADING",
        },
      });
      return { assetId, uploadUrl, expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() };
    });
    return NextResponse.json(success(result.data, context.requestId), { headers: { "Cache-Control": "no-store", ...(result.replayed && { "Idempotency-Replayed": "true" }) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "IDEMPOTENCY_KEY_INVALID") return NextResponse.json(failure("VALIDATION_ERROR", "Idempotency-Key 无效", context.requestId), { status: 400 });
    if (["IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_EXPIRED"].includes(message)) return NextResponse.json(failure("VERSION_CONFLICT", "重复上传请求冲突或已过期", context.requestId), { status: 409 });
    if (message === "GLOBAL_ASSET_LIMIT") return NextResponse.json(failure("RATE_LIMITED", "本次活动的图片容量已达到安全上限，请联系管理员", context.requestId), { status: 429 });
    return NextResponse.json(failure("INTERNAL_ERROR", "无法创建上传任务", context.requestId), { status: 500 });
  }
}
