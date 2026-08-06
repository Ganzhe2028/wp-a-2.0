import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "../../workers/image-processor/src/index.js";

const completeUrl = new URL("../../app/api/v1/assets/[assetId]/complete/route.ts", import.meta.url);
const callbackUrl = new URL("../../app/api/internal/assets/[assetId]/processed/route.ts", import.meta.url);
const workerUrl = new URL("../../workers/image-processor/src/index.js", import.meta.url);
const workerConfigUrl = new URL("../../workers/image-processor/wrangler.jsonc", import.meta.url);
const corsUrl = new URL("../../workers/image-processor/cors-policy.json", import.meta.url);
const wranglerCorsUrl = new URL("../../workers/image-processor/cors-policy.wrangler.json", import.meta.url);
const mediaAuthorizationUrl = new URL("../../app/api/internal/assets/authorize/route.ts", import.meta.url);
const processorAuthUrl = new URL("../../lib/server/asset-processor-auth.ts", import.meta.url);

test("non-local uploads remain processing until an authenticated verified worker result", async () => {
  const [complete, callback, processorAuth] = await Promise.all([
    readFile(completeUrl, "utf8"),
    readFile(callbackUrl, "utf8"),
    readFile(processorAuthUrl, "utf8"),
  ]);
  assert.match(complete, /Boolean\(process\.env\.LOCAL_UPLOAD_DIR\)/);
  assert.match(complete, /scanStatus:\s*"PROCESSING"/);
  assert.match(complete, /processingStatus:\s*"PROCESSING"/);
  assert.match(callback, /verifyAssetProcessorRequest/);
  assert.match(processorAuth, /ASSET_PROCESSOR_SECRET/);
  assert.match(processorAuth, /timingSafeEqual/);
  assert.match(callback, /headR2Object/);
  assert.match(callback, /metadata\.checksum/);
  assert.doesNotMatch(callback, /readR2Object|createHash\("sha256"\)/);
  assert.match(callback, /width\s*<=\s*0/);
  assert.match(callback, /scanStatus:\s*"PASSED",\s*processingStatus:\s*"READY"/);
});

test("production image worker is signed, sanitizes bytes, and reports an authenticated result", async () => {
  const [callback, worker, workerConfig, corsSource, wranglerCorsSource] = await Promise.all([
    readFile(callbackUrl, "utf8"),
    readFile(workerUrl, "utf8"),
    readFile(workerConfigUrl, "utf8"),
    readFile(corsUrl, "utf8"),
    readFile(wranglerCorsUrl, "utf8"),
  ]);
  const cors = JSON.parse(corsSource);
  const wranglerCors = JSON.parse(wranglerCorsSource);
  assert.match(callback, /body\.probe === true/);
  assert.match(callback, /processedKey/);
  assert.match(worker, /env\.IMAGES\.info/);
  assert.match(worker, /\.output\(/);
  assert.match(worker, /env\.IMAGES_BUCKET\.put/);
  assert.match(worker, /_derived\/\$\{processedKey\}\.thumb\.webp/);
  assert.match(worker, /processedKeyFromIncoming/);
  assert.doesNotMatch(worker, /caches\.default/);
  assert.match(worker, /key\.startsWith\("processed\/"\)/);
  assert.match(worker, /key\.startsWith\("_derived\/processed\/"\)/);
  assert.match(worker, /authorizeAssetRequest/);
  assert.match(worker, /Cache-Control", "private, no-store"/);
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
  assert.match(workerConfig, /"APP_BASE_URL": "https:\/\/msoweek\.site"/);
  assert.match(workerConfig, /"PUBLIC_ORIGIN": "https:\/\/msoweek\.site"/);
  assert.deepEqual(cors[0].AllowedOrigins, [
    "https://www.msoweek.site",
    "https://msoweek.site",
    "https://oweek-wp-a-2.vercel.app",
  ]);
  assert.ok(cors[0].AllowedMethods.includes("PUT"));
  assert.ok(cors[0].AllowedHeaders.includes("Content-Type"));
  assert.equal(JSON.stringify(cors).includes('"*"'), false);
  assert.deepEqual(wranglerCors.rules[0].allowed.origins, cors[0].AllowedOrigins);
  assert.deepEqual(wranglerCors.rules[0].allowed.methods, cors[0].AllowedMethods);
  assert.deepEqual(wranglerCors.rules[0].allowed.headers, cors[0].AllowedHeaders);
  assert.deepEqual(wranglerCors.rules[0].exposeHeaders, cors[0].ExposeHeaders);
  assert.equal(wranglerCors.rules[0].maxAgeSeconds, cors[0].MaxAgeSeconds);
  assert.equal(JSON.stringify(wranglerCors).includes('"*"'), false);
});

test("processed media is fail-closed until the application authorizes the current session", async () => {
  const authorizationRoute = await readFile(mediaAuthorizationUrl, "utf8");
  assert.match(authorizationRoute, /getFormalSession/);
  assert.match(authorizationRoute, /canViewerAccessArtworkOwner/);
  assert.match(authorizationRoute, /scanStatus:\s*"PASSED"/);
  assert.match(authorizationRoute, /processingStatus:\s*"READY"/);
  assert.match(authorizationRoute, /status\s*===\s*"SUBMITTED"/);

  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  let bucketReads = 0;
  let authorizationRequest;
  const env = {
    APP_BASE_URL: "https://app.example",
    ASSET_PROCESSOR_SECRET: "test-only-shared-secret-with-32-bytes",
    PUBLIC_ORIGIN: "https://app.example",
    IMAGES_BUCKET: {
      async get() {
        bucketReads += 1;
        return {
          body: new Uint8Array([1, 2, 3]),
          httpEtag: '"etag"',
          size: 3,
          writeHttpMetadata(headers) { headers.set("Content-Type", "image/jpeg"); },
        };
      },
    },
  };
  const context = { waitUntil() {} };
  globalThis.caches = { default: { async match() { return null; }, async put() {} } };

  try {
    globalThis.fetch = async (input, init) => {
      authorizationRequest = new Request(input, init);
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    };
    const denied = await worker.fetch(
      new Request("https://worker.example/assets/processed/event/user/asset.jpg", {
        headers: { Cookie: "oweek_session=test-session" },
      }),
      env,
      context,
    );
    assert.equal(denied.status, 404);
    assert.equal(bucketReads, 0);
    assert.equal(new URL(authorizationRequest.url).pathname, "/api/internal/assets/authorize");
    assert.equal(authorizationRequest.headers.get("cookie"), "oweek_session=test-session");
    assert.match(authorizationRequest.headers.get("x-oweek-signature") ?? "", /^[0-9a-f]{64}$/);

    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
    const allowed = await worker.fetch(
      new Request("https://worker.example/assets/processed/event/user/asset.jpg", {
        headers: { Cookie: "oweek_session=test-session" },
      }),
      env,
      context,
    );
    assert.equal(allowed.status, 200);
    assert.equal(bucketReads, 1);
    assert.equal(allowed.headers.get("Cache-Control"), "private, no-store");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
  }
});

test("processing dispatch retries and stale processing assets self-heal while being polled", async () => {
  const [processor, statusRoute, presignRoute] = await Promise.all([
    readFile(new URL("../../lib/server/asset-processor.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/api/v1/assets/[assetId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/api/v1/assets/presign/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(processor, /for \(let attempt = 0; attempt < 3/);
  assert.match(statusRoute, /updatedAt:\s*\{ lte:/);
  assert.match(statusRoute, /STALE_PROCESSING_MS = 30_000/);
  assert.match(statusRoute, /after\(\(\) => processAssetAfterResponse/);
  assert.match(presignRoute, /asset presign rejected/);
  assert.match(presignRoute, /"TOO_LARGE"/);
});
