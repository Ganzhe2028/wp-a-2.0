import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readR2Object } from "@/lib/r2";

interface RouteContext { params: Promise<{ assetId: string }> }

function validSignature(request: Request, body: string): boolean {
  const secret = process.env.ASSET_PROCESSOR_SECRET?.trim() || "";
  const timestamp = request.headers.get("x-oweek-timestamp") || "";
  const supplied = request.headers.get("x-oweek-signature") || "";
  const timestampMs = Number(timestamp) * 1_000;
  if (!secret || !Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1_000) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

function imageMime(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export async function POST(request: Request, routeContext: RouteContext) {
  const rawBody = await request.text();
  if (!validSignature(request, rawBody)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const object = await readR2Object(processedKey, byteSize);
    if (object.bytes.length !== byteSize || imageMime(object.bytes) !== mimeType || createHash("sha256").update(object.bytes).digest("hex") !== checksum) throw new Error("mismatch");
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
