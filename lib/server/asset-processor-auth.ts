import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1_000;

// 内部接口 body 上限：超出直接拒绝，避免未认证请求强制无限缓冲（request.text()）
export const MAX_INTERNAL_BODY_BYTES = 1024 * 1024;

export async function readBoundedBody(request: Request, maxBytes = MAX_INTERNAL_BODY_BYTES): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) return null;
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function verifyAssetProcessorRequest(request: Request, body: string): boolean {
  const secret = process.env.ASSET_PROCESSOR_SECRET?.trim() || "";
  const timestamp = request.headers.get("x-oweek-timestamp") || "";
  const supplied = request.headers.get("x-oweek-signature") || "";
  const timestampMs = Number(timestamp) * 1_000;
  if (!secret || !Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > SIGNATURE_MAX_AGE_MS) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}
