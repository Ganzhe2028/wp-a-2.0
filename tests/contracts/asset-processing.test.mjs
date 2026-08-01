import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const completeUrl = new URL("../../app/api/v1/assets/[assetId]/complete/route.ts", import.meta.url);
const callbackUrl = new URL("../../app/api/internal/assets/[assetId]/processed/route.ts", import.meta.url);
const workerUrl = new URL("../../workers/image-processor/src/index.js", import.meta.url);
const workerConfigUrl = new URL("../../workers/image-processor/wrangler.jsonc", import.meta.url);
const corsUrl = new URL("../../workers/image-processor/cors-policy.json", import.meta.url);

test("non-local uploads remain processing until an authenticated verified worker result", async () => {
  const [complete, callback] = await Promise.all([readFile(completeUrl, "utf8"), readFile(callbackUrl, "utf8")]);
  assert.match(complete, /Boolean\(process\.env\.LOCAL_UPLOAD_DIR\)/);
  assert.match(complete, /scanStatus:\s*"PROCESSING"/);
  assert.match(complete, /processingStatus:\s*"PROCESSING"/);
  assert.match(callback, /ASSET_PROCESSOR_SECRET/);
  assert.match(callback, /timingSafeEqual/);
  assert.match(callback, /readR2Object/);
  assert.match(callback, /createHash\("sha256"\)/);
  assert.match(callback, /width\s*<=\s*0/);
  assert.match(callback, /scanStatus:\s*"PASSED",\s*processingStatus:\s*"READY"/);
});

test("production image worker is signed, sanitizes bytes, and reports an authenticated result", async () => {
  const [callback, worker, workerConfig, cors] = await Promise.all([
    readFile(callbackUrl, "utf8"),
    readFile(workerUrl, "utf8"),
    readFile(workerConfigUrl, "utf8"),
    readFile(corsUrl, "utf8"),
  ]);
  assert.match(callback, /body\.probe === true/);
  assert.match(callback, /processedKey/);
  assert.match(worker, /env\.IMAGES\.info/);
  assert.match(worker, /\.output\(/);
  assert.match(worker, /env\.IMAGES_BUCKET\.put/);
  assert.match(worker, /_derived\/\$\{processedKey\}\.thumb\.webp/);
  assert.match(worker, /processedKeyFromIncoming/);
  assert.match(worker, /caches\.default/);
  assert.match(worker, /key\.startsWith\("incoming\/"\)/);
  assert.match(worker, /crypto\.subtle\.sign\("HMAC"/);
  assert.match(worker, /x-oweek-signature/);
  assert.match(worker, /validSignedRequest/);
  assert.match(worker, /url\.pathname === "\/process"/);
  assert.match(worker, /context\.waitUntil\(processAssetWithRetry/);
  assert.match(worker, /status: "ACCEPTED"/);
  assert.match(worker, /PROCESS_RETRY_DELAYS_MS/);
  assert.doesNotMatch(worker, /async queue\(/);
  assert.match(workerConfig, /"images"/);
  assert.doesNotMatch(workerConfig, /"queues"/);
  assert.match(workerConfig, /"r2_buckets"/);
  assert.match(cors, /https:\/\/oweek-wp-a-2\.vercel\.app/);
  assert.match(cors, /"PUT"/);
  assert.match(cors, /"Content-Type"/);
  assert.doesNotMatch(cors, /"\*"/);
});

test("processing dispatch retries and stale processing assets self-heal while being polled", async () => {
  const [processor, statusRoute, presignRoute] = await Promise.all([
    readFile(new URL("../../lib/server/asset-processor.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/api/v1/assets/[assetId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/api/v1/assets/presign/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(processor, /for \(let attempt = 0; attempt < 3/);
  assert.match(statusRoute, /updatedAt:\s*\{ lte:/);
  assert.match(statusRoute, /after\(\(\) => processAssetAfterResponse/);
  assert.match(presignRoute, /asset presign rejected/);
  assert.match(presignRoute, /"TOO_LARGE"/);
});
