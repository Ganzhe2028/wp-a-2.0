import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1_000;

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
