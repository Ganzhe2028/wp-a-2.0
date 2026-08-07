import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { headR2Object } from "@/lib/r2";
import { verifyAssetProcessorRequest, readBoundedBody } from "@/lib/server/asset-processor-auth";

interface RouteContext { params: Promise<{ assetId: string }> }

export async function POST(request: Request, routeContext: RouteContext) {
  const rawBody = await readBoundedBody(request);
  if (rawBody === null) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  if (!verifyAssetProcessorRequest(request, rawBody)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const { assetId } = await routeContext.params;
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (body.probe === true) {
    return NextResponse.json({
      ok: true,
      status: asset.processingStatus,
      scanStatus: asset.scanStatus,
      storageKey: asset.storageKey,
    }, { headers: { "Cache-Control": "no-store" } });
  }
  if (body.scanPassed !== true) {
    await prisma.asset.update({ where: { id: asset.id }, data: { scanStatus: "FAILED", processingStatus: "FAILED" } });
    return NextResponse.json({ ok: true, status: "FAILED" });
  }
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
  const byteSize = Number(body.byteSize);
  const width = Number(body.width);
  const height = Number(body.height);
  const checksum = typeof body.checksum === "string" ? body.checksum.toLowerCase() : "";
  const processedKey = typeof body.processedKey === "string" ? body.processedKey : "";
  const expectedProcessedKey = asset.storageKey.startsWith("incoming/")
    ? `processed/${asset.storageKey.slice("incoming/".length)}`
    : asset.storageKey;
  if (processedKey !== expectedProcessedKey || !processedKey.startsWith("processed/") || !Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > 1024 * 1024 || !Number.isSafeInteger(width) || width <= 0 || width > 10_000 || !Number.isSafeInteger(height) || height <= 0 || height > 10_000 || !/^[0-9a-f]{64}$/.test(checksum) || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    return NextResponse.json({ error: "Invalid result" }, { status: 400 });
  }
  if (asset.processingStatus === "READY" && asset.scanStatus === "PASSED") {
    const same = asset.storageKey === processedKey && asset.mimeType === mimeType && asset.byteSize === BigInt(byteSize) && asset.checksum === checksum && asset.width === width && asset.height === height;
    return NextResponse.json({ ok: same, status: same ? "READY" : "CONFLICT" }, { status: same ? 200 : 409 });
  }
  try {
    const object = await headR2Object(processedKey);
    const metadata = Object.fromEntries(Object.entries(object.metadata || {}).map(([key, value]) => [key.toLowerCase(), value]));
    if (object.contentLength !== byteSize || object.contentType !== mimeType || metadata.assetid !== asset.id || metadata.mimetype !== mimeType || metadata.bytesize !== String(byteSize) || metadata.width !== String(width) || metadata.height !== String(height) || metadata.checksum !== checksum || metadata.oweekprocessed !== "v1") throw new Error("mismatch");
    await prisma.asset.update({
      where: { id: asset.id },
      data: { storageKey: processedKey, mimeType, byteSize: BigInt(byteSize), width, height, checksum, scanStatus: "PASSED", processingStatus: "READY" },
    });
    return NextResponse.json({ ok: true, status: "READY" });
  } catch {
    await prisma.asset.update({ where: { id: asset.id }, data: { scanStatus: "FAILED", processingStatus: "FAILED" } });
    return NextResponse.json({ error: "Processed object verification failed" }, { status: 422 });
  }
}
