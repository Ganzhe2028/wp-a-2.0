import { after, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { failure, success } from "@/lib/contracts";
import { prisma } from "@/lib/prisma";
import { requireFormalViewer } from "@/lib/server/student-request";
import { decideAuthoring } from "@/lib/domain/authoring";
import { getPublicUrl, headR2Object, readR2Object } from "@/lib/r2";
import { createIdempotencyContext, runIdempotentTransaction } from "@/lib/server/idempotency";
import { requestAssetProcessing } from "@/lib/server/asset-processor";

interface RouteContext { params: Promise<{ assetId: string }> }

export const maxDuration = 45;

function detectImageMime(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

async function processAssetAfterResponse(assetId: string, storageKey: string) {
  try {
    await requestAssetProcessing(assetId, storageKey);
  } catch {
    const current = await prisma.asset.findUnique({ where: { id: assetId }, select: { processingStatus: true } });
    if (current?.processingStatus !== "READY") {
      await prisma.asset.update({ where: { id: assetId }, data: { scanStatus: "FAILED", processingStatus: "FAILED" } });
    }
  }
}

export async function POST(request: Request, routeContext: RouteContext) {
  const context = await requireFormalViewer(request, { write: true });
  if (!context.ok) return context.response;
  const { assetId } = await routeContext.params;
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(failure("VALIDATION_ERROR", "请求格式无效", context.requestId), { status: 400 });
  }
  let idempotency;
  try {
    idempotency = createIdempotencyContext({ request, body, eventId: context.viewer.eventId, actorUserId: context.viewer.userId, scope: `ASSET_COMPLETE:${assetId}` });
  } catch {
    return NextResponse.json(failure("VALIDATION_ERROR", "Idempotency-Key 无效", context.requestId), { status: 400 });
  }
  const [settings, submission, asset] = await Promise.all([
    prisma.eventSettings.findUnique({ where: { eventId: context.viewer.eventId } }),
    prisma.submission.findUnique({ where: { eventId_userId_section: { eventId: context.viewer.eventId, userId: context.viewer.userId, section: "DAY1" } }, select: { status: true } }),
    prisma.asset.findFirst({ where: { id: assetId, eventId: context.viewer.eventId, ownerUserId: context.viewer.userId } }),
  ]);
  const authoring = decideAuthoring({ role: context.viewer.role, section: "DAY1", status: submission?.status ?? "NOT_STARTED", settings });
  if (!authoring.allowed) return NextResponse.json(failure(authoring.code, "当前不可完成上传", context.requestId), { status: 403 });
  if (!asset) return NextResponse.json(failure("FORBIDDEN", "资源不存在", context.requestId), { status: 404 });
  try {
    const object = await headR2Object(asset.storageKey);
    if (object.contentType && object.contentType !== asset.mimeType) throw new Error("mime");
    if (object.contentLength && BigInt(object.contentLength) !== asset.byteSize) throw new Error("size");
    const downloaded = await readR2Object(asset.storageKey, Number(asset.byteSize));
    if (BigInt(downloaded.bytes.length) !== asset.byteSize) throw new Error("size");
    if (detectImageMime(downloaded.bytes) !== asset.mimeType) throw new Error("magic");
    if (createHash("sha256").update(downloaded.bytes).digest("hex") !== asset.checksum) throw new Error("checksum");
  } catch {
    await prisma.asset.update({ where: { id: asset.id }, data: { scanStatus: "FAILED", processingStatus: "FAILED" } });
    return NextResponse.json(failure("ASSET_PROCESSING_FAILED", "图片处理失败", context.requestId), { status: 422 });
  }

  try {
    const localValidated = Boolean(process.env.LOCAL_UPLOAD_DIR);
    const result = await runIdempotentTransaction(idempotency, async (tx) => {
      await tx.asset.update({
        where: { id: asset.id },
        data: localValidated
          ? { scanStatus: "PASSED", processingStatus: "READY" }
          : { scanStatus: "PROCESSING", processingStatus: "PROCESSING" },
      });
      return {
        assetId: asset.id,
        status: localValidated ? "READY" : "PROCESSING",
        ...(localValidated && { imageUrl: getPublicUrl(asset.storageKey) }),
      };
    });
    if (!localValidated && !result.replayed) after(() => processAssetAfterResponse(asset.id, asset.storageKey));
    return NextResponse.json(success(result.data, context.requestId), { status: localValidated ? 200 : 202, headers: { "Cache-Control": "no-store", ...(result.replayed && { "Idempotency-Replayed": "true" }) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (["IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_EXPIRED"].includes(message)) {
      return NextResponse.json(failure("VERSION_CONFLICT", "重复上传完成请求冲突或已过期", context.requestId), { status: 409 });
    }
    return NextResponse.json(failure("INTERNAL_ERROR", "资源状态暂时无法保存", context.requestId), { status: 500 });
  }
}
