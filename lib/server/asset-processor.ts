import { createHmac } from "node:crypto";

export async function requestAssetProcessing(assetId: string, storageKey: string): Promise<void> {
  const endpoint = process.env.ASSET_PROCESSOR_URL?.trim().replace(/\/$/, "") || "";
  const secret = process.env.ASSET_PROCESSOR_SECRET?.trim() || "";
  if (!endpoint || !secret) throw new Error("ASSET_PROCESSOR_NOT_CONFIGURED");

  const body = JSON.stringify({ assetId, storageKey });
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const response = await fetch(`${endpoint}/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-oweek-timestamp": timestamp,
      "x-oweek-signature": signature,
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`ASSET_PROCESSOR_${response.status}`);
}
