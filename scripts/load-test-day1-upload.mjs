import assert from "node:assert/strict";
import { createServer } from "node:http";
import { performance } from "node:perf_hooks";

const VIRTUAL_USERS = 100;
const IMAGES_PER_USER = 15;
const IMAGE_BYTES = 512 * 1024;
const RETRY_DELAYS_MS = [5, 12, 25];
const POLL_DELAYS_MS = [2, 4, 6, 8, 10, 12, 15, 20];

const assets = new Map();
const drafts = new Map();
const idempotency = new Map();
const requestCounts = new Map();
const metrics = {
  activePipelines: 0,
  peakPipelines: 0,
  peakPerUser: new Map(),
  statusPolls: 0,
  injectedFailures: 0,
  recoveredRetries: 0,
  uploadedBytes: 0,
  imageDurations: [],
};

function stableNumber(value) {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619) >>> 0;
  return result;
}

function shouldFailOnce(key, divisor) {
  const count = requestCounts.get(key) || 0;
  requestCounts.set(key, count + 1);
  return count === 0 && stableNumber(key) % divisor === 0;
}

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  response.end(body);
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  const key = request.headers["idempotency-key"];

  if (request.method === "POST" && url.pathname === "/presign") {
    const body = JSON.parse((await readBody(request)).toString("utf8"));
    const replay = typeof key === "string" ? idempotency.get(`presign:${key}`) : undefined;
    if (replay) return json(response, 200, replay);
    const assetId = `${body.userId}-${body.slotKey}`;
    const result = { assetId, uploadUrl: `${origin}/r2/${encodeURIComponent(assetId)}` };
    if (typeof key === "string") idempotency.set(`presign:${key}`, result);
    assets.set(assetId, { owner: body.userId, uploaded: false, status: "UPLOADING" });
    if (shouldFailOnce(`presign:${assetId}`, 29)) {
      metrics.injectedFailures += 1;
      return json(response, 503, { error: "injected presign timeout after commit" });
    }
    return json(response, 200, result);
  }

  if (request.method === "PUT" && url.pathname.startsWith("/r2/")) {
    const assetId = decodeURIComponent(url.pathname.slice("/r2/".length));
    const asset = assets.get(assetId);
    if (!asset) return json(response, 404, { error: "missing asset" });
    const bytes = await readBody(request);
    if (bytes.length !== IMAGE_BYTES) return json(response, 400, { error: "wrong byte length" });
    if (shouldFailOnce(`put:${assetId}`, 37)) {
      metrics.injectedFailures += 1;
      return json(response, 503, { error: "injected object-store failure" });
    }
    asset.uploaded = true;
    metrics.uploadedBytes += bytes.length;
    return json(response, 200, { ok: true });
  }

  const completeMatch = request.method === "POST" && /^\/assets\/[^/]+\/complete$/.test(url.pathname);
  if (completeMatch) {
    const assetId = decodeURIComponent(url.pathname.split("/")[2]);
    const asset = assets.get(assetId);
    if (!asset?.uploaded) return json(response, 422, { error: "not uploaded" });
    const replay = typeof key === "string" ? idempotency.get(`complete:${key}`) : undefined;
    if (replay) return json(response, 202, replay);
    asset.status = "PROCESSING";
    const result = { assetId, status: "PROCESSING" };
    if (typeof key === "string") idempotency.set(`complete:${key}`, result);
    setTimeout(() => { asset.status = "READY"; }, 12 + stableNumber(assetId) % 25);
    if (shouldFailOnce(`complete:${assetId}`, 31)) {
      metrics.injectedFailures += 1;
      return json(response, 503, { error: "injected completion timeout after commit" });
    }
    return json(response, 202, result);
  }

  const statusMatch = request.method === "GET" && /^\/assets\/[^/]+$/.test(url.pathname);
  if (statusMatch) {
    const assetId = decodeURIComponent(url.pathname.split("/")[2]);
    const asset = assets.get(assetId);
    metrics.statusPolls += 1;
    if (!asset) return json(response, 404, { error: "missing asset" });
    return json(response, 200, asset.status === "READY"
      ? { status: "READY", imageUrl: `${origin}/images/${encodeURIComponent(assetId)}.webp` }
      : { status: asset.status });
  }

  if (request.method === "PUT" && url.pathname === "/draft") {
    const body = JSON.parse((await readBody(request)).toString("utf8"));
    const replay = typeof key === "string" ? idempotency.get(`draft:${key}`) : undefined;
    if (replay) return json(response, 200, replay);
    const current = drafts.get(body.userId) || { version: 1, slots: [] };
    if (current.version !== body.version) return json(response, 409, { error: "version conflict" });
    const next = { version: current.version + 1, slots: body.slots };
    drafts.set(body.userId, next);
    const result = { version: next.version };
    if (typeof key === "string") idempotency.set(`draft:${key}`, result);
    if (shouldFailOnce(`draft:${body.userId}:${body.slots.length}`, 23)) {
      metrics.injectedFailures += 1;
      return json(response, 503, { error: "injected draft timeout after commit" });
    }
    return json(response, 200, result);
  }

  return json(response, 404, { error: "not found" });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const origin = `http://127.0.0.1:${address.port}`;
const imagePayload = Buffer.alloc(IMAGE_BYTES, 0xa5);

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function localFetch(path, init) {
  const url = new URL(path, origin);
  assert.equal(url.hostname, "127.0.0.1", "load test attempted non-loopback network access");
  return fetch(url, { ...init, signal: AbortSignal.timeout(2_000) });
}

async function retryRequest(task, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await task();
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      if (attempt > 0) metrics.recoveredRetries += 1;
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
}

async function runPipeline(userId, slotKey) {
  const startedAt = performance.now();
  metrics.activePipelines += 1;
  metrics.peakPipelines = Math.max(metrics.peakPipelines, metrics.activePipelines);
  const activeForUser = (metrics.peakPerUser.get(userId) || 0) + 1;
  metrics.peakPerUser.set(userId, activeForUser);
  assert.equal(activeForUser, 1, `${userId} started more than one upload pipeline`);
  try {
    const presignKey = `presign-${userId}-${slotKey}`;
    const presign = await retryRequest(() => localFetch("/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": presignKey },
      body: JSON.stringify({ userId, slotKey }),
    })).then((response) => response.json());

    await retryRequest(() => localFetch(presign.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/webp" },
      body: imagePayload,
    }));

    const completeKey = `complete-${userId}-${slotKey}`;
    await retryRequest(() => localFetch(`/assets/${encodeURIComponent(presign.assetId)}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": completeKey },
      body: JSON.stringify({ section: "DAY1" }),
    }));

    for (const delay of POLL_DELAYS_MS) {
      await sleep(delay);
      const status = await retryRequest(() => localFetch(`/assets/${encodeURIComponent(presign.assetId)}`)).then((response) => response.json());
      if (status.status === "READY") {
        metrics.imageDurations.push(performance.now() - startedAt);
        return { slotKey, assetId: presign.assetId, crop: { x: 0.5, y: 0.5, scale: 1 } };
      }
    }
    throw new Error(`${presign.assetId} did not become READY within bounded polling`);
  } finally {
    metrics.activePipelines -= 1;
    metrics.peakPerUser.set(userId, (metrics.peakPerUser.get(userId) || 1) - 1);
  }
}

async function saveDraft(userId, version, slots) {
  const key = `draft-${userId}-${slots.length}`;
  return retryRequest(() => localFetch("/draft", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({ userId, version, slots }),
  })).then((response) => response.json());
}

async function runVirtualUser(index) {
  const userId = `load-user-${String(index + 1).padStart(3, "0")}`;
  const slots = [];
  let version = 1;
  for (let slot = 0; slot < IMAGES_PER_USER; slot += 1) {
    slots.push(await runPipeline(userId, `slot-${String(slot + 1).padStart(2, "0")}`));
    const saved = await saveDraft(userId, version, slots);
    version = saved.version;
  }
}

const runStartedAt = performance.now();
let runError;
try {
  await Promise.all(Array.from({ length: VIRTUAL_USERS }, (_, index) => runVirtualUser(index)));
} catch (error) {
  runError = error;
} finally {
  await new Promise((resolve) => server.close(resolve));
}
if (runError) throw runError;

for (let index = 0; index < VIRTUAL_USERS; index += 1) {
  const userId = `load-user-${String(index + 1).padStart(3, "0")}`;
  const draft = drafts.get(userId);
  assert.equal(draft?.slots.length, IMAGES_PER_USER, `${userId} lost draft slots`);
  assert.equal(new Set(draft.slots.map((slot) => slot.assetId)).size, IMAGES_PER_USER, `${userId} has duplicate assets`);
}

const sortedDurations = metrics.imageDurations.toSorted((left, right) => left - right);
const percentile = (value) => sortedDurations[Math.min(sortedDurations.length - 1, Math.floor(sortedDurations.length * value))];
const totalImages = VIRTUAL_USERS * IMAGES_PER_USER;
assert.equal(assets.size, totalImages);
assert.equal(metrics.imageDurations.length, totalImages);
assert.equal(metrics.peakPipelines, VIRTUAL_USERS);
assert.ok(metrics.statusPolls <= totalImages * POLL_DELAYS_MS.length);

console.log(JSON.stringify({
  mode: "loopback-only (Cloudflare/Vercel/Neon not contacted)",
  virtualUsers: VIRTUAL_USERS,
  imagesPerUser: IMAGES_PER_USER,
  totalImages,
  simulatedImageSizeKiB: IMAGE_BYTES / 1024,
  loopbackUploadMiB: Number((metrics.uploadedBytes / 1024 / 1024).toFixed(1)),
  peakConcurrentPipelines: metrics.peakPipelines,
  injectedTransientFailures: metrics.injectedFailures,
  recoveredRetries: metrics.recoveredRetries,
  averageStatusPollsPerImage: Number((metrics.statusPolls / totalImages).toFixed(2)),
  imageLatencyMs: { p50: Math.round(percentile(0.5)), p95: Math.round(percentile(0.95)), p99: Math.round(percentile(0.99)) },
  totalDurationSeconds: Number(((performance.now() - runStartedAt) / 1_000).toFixed(2)),
  savedDrafts: drafts.size,
  lostDrafts: 0,
}, null, 2));
