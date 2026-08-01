const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const PROCESSED_VERSION = "v1";
const MAX_DIMENSION = 10_000;
const CANONICAL_WIDTH = 1_600;
const THUMBNAIL_WIDTH = 480;
const MAX_CANONICAL_BYTES = 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 256 * 1024;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function secureEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function sha256(bytes) {
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

async function hmac(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

async function validSignedRequest(request, body, secret) {
  const timestamp = request.headers.get("x-oweek-timestamp") || "";
  const supplied = request.headers.get("x-oweek-signature") || "";
  const timestampMs = Number(timestamp) * 1_000;
  if (!secret || !Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1_000) return false;
  return secureEqual(await hmac(secret, `${timestamp}.${body}`), supplied);
}

export function assetIdFromKey(key) {
  const match = /(?:^|\/)([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(?:jpg|png|webp)$/i.exec(key);
  return match?.[1] ?? null;
}

function detectedMime(bytes) {
  const view = new Uint8Array(bytes);
  if (view.length >= 3 && view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff) return "image/jpeg";
  if (view.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => view[index] === value)) return "image/png";
  if (view.length >= 12 && new TextDecoder("ascii").decode(view.slice(0, 4)) === "RIFF" && new TextDecoder("ascii").decode(view.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

function validDimension(value) {
  return Number.isInteger(value) && value > 0 && value <= MAX_DIMENSION;
}

function outputOptions(mimeType) {
  return mimeType === "image/png"
    ? { format: mimeType, anim: false }
    : { format: mimeType, quality: 85, anim: false };
}

async function callApplication(env, assetId, payload) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const signature = await hmac(env.ASSET_PROCESSOR_SECRET, `${timestamp}.${body}`);
  const response = await fetch(
    `${env.APP_BASE_URL.replace(/\/$/, "")}/api/internal/assets/${encodeURIComponent(assetId)}/processed`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-oweek-timestamp": timestamp,
        "x-oweek-signature": signature,
      },
      body,
    },
  );
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { ok: response.ok, status: response.status, data };
}

async function probeAsset(env, assetId) {
  const result = await callApplication(env, assetId, { probe: true });
  if (result.status === 404) return { status: "MISSING", storageKey: null };
  if (!result.ok || typeof result.data?.status !== "string") throw new Error(`PROBE_${result.status}`);
  return {
    status: result.data.status,
    storageKey: typeof result.data.storageKey === "string" ? result.data.storageKey : null,
  };
}

function metadataResult(object, assetId, processedKey) {
  const metadata = object.customMetadata || {};
  if (metadata.oweekProcessed !== PROCESSED_VERSION || metadata.assetId !== assetId) return null;
  const byteSize = Number(metadata.byteSize);
  const width = Number(metadata.width);
  const height = Number(metadata.height);
  const mimeType = metadata.mimeType || "";
  const checksum = metadata.checksum || "";
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || !validDimension(width) || !validDimension(height) || !ALLOWED_MIME.has(mimeType) || !/^[0-9a-f]{64}$/.test(checksum)) return null;
  return { scanPassed: true, processedKey, mimeType, byteSize, width, height, checksum };
}

async function notifyReady(env, assetId, result) {
  const callback = await callApplication(env, assetId, result);
  if (!callback.ok) throw new Error(`CALLBACK_${callback.status}`);
}

async function notifyFailed(env, assetId) {
  const callback = await callApplication(env, assetId, { scanPassed: false });
  if (!callback.ok) throw new Error(`FAIL_CALLBACK_${callback.status}`);
}

async function transformImage(env, bytes, mimeType) {
  const inputInfo = await env.IMAGES.info(bytes);
  if (!validDimension(inputInfo.width) || !validDimension(inputInfo.height)) throw new Error("INVALID_DIMENSIONS");

  const canonicalResponse = (
    await env.IMAGES.input(bytes)
      .transform({ width: CANONICAL_WIDTH, fit: "scale-down" })
      .output(outputOptions(mimeType))
  ).response();
  if (!canonicalResponse.ok) throw new Error(`CANONICAL_${canonicalResponse.status}`);
  const canonicalBytes = await canonicalResponse.arrayBuffer();
  const canonicalInfo = await env.IMAGES.info(canonicalBytes);
  if (!validDimension(canonicalInfo.width) || !validDimension(canonicalInfo.height)) throw new Error("INVALID_CANONICAL_DIMENSIONS");

  const thumbnailResponse = (
    await env.IMAGES.input(bytes)
      .transform({ width: THUMBNAIL_WIDTH, fit: "scale-down" })
      .output({ format: "image/webp", quality: 80, anim: false })
  ).response();
  if (!thumbnailResponse.ok) throw new Error(`THUMBNAIL_${thumbnailResponse.status}`);

  const thumbnailBytes = await thumbnailResponse.arrayBuffer();
  if (canonicalBytes.byteLength > MAX_CANONICAL_BYTES || thumbnailBytes.byteLength > MAX_THUMBNAIL_BYTES) {
    throw new Error("PROCESSED_IMAGE_TOO_LARGE");
  }

  return {
    canonicalBytes,
    thumbnailBytes,
    width: canonicalInfo.width,
    height: canonicalInfo.height,
  };
}

function processedKeyFromIncoming(key) {
  return key.startsWith("incoming/") ? `processed/${key.slice("incoming/".length)}` : null;
}

async function processAsset(assetId, key, env) {
  const processedKey = processedKeyFromIncoming(key);
  if (!processedKey || assetIdFromKey(key) !== assetId) throw new Error("INVALID_ASSET_KEY");

  const probe = await probeAsset(env, assetId);
  if (probe.status === "MISSING" || probe.status === "FAILED") {
    await env.IMAGES_BUCKET.delete(key);
    return probe.status;
  }
  if (probe.status === "READY") {
    if (probe.storageKey === processedKey) await env.IMAGES_BUCKET.delete(key);
    return "READY";
  }
  if (probe.status !== "PROCESSING") throw new Error(`ASSET_NOT_READY_${probe.status}`);

  const object = await env.IMAGES_BUCKET.get(key);
  if (!object) throw new Error("SOURCE_OBJECT_MISSING");
  const existingProcessed = await env.IMAGES_BUCKET.get(processedKey);
  const previousResult = existingProcessed ? metadataResult(existingProcessed, assetId, processedKey) : null;
  if (previousResult) {
    await notifyReady(env, assetId, previousResult);
    await env.IMAGES_BUCKET.delete(key);
    return "READY";
  }

  const maxBytes = Number(env.MAX_IMAGE_BYTES || 20 * 1024 * 1024);
  const mimeType = object.httpMetadata?.contentType || "";
  if (!Number.isSafeInteger(maxBytes) || object.size <= 0 || object.size > maxBytes || !ALLOWED_MIME.has(mimeType)) {
    await notifyFailed(env, assetId);
    await env.IMAGES_BUCKET.delete(key);
    return "FAILED";
  }
  const bytes = await object.arrayBuffer();
  if (bytes.byteLength !== object.size || detectedMime(bytes) !== mimeType) {
    await notifyFailed(env, assetId);
    await env.IMAGES_BUCKET.delete(key);
    return "FAILED";
  }

  let transformed;
  try {
    transformed = await transformImage(env, bytes, mimeType);
  } catch {
    await notifyFailed(env, assetId);
    await env.IMAGES_BUCKET.delete(key);
    return "FAILED";
  }
  const checksum = await sha256(transformed.canonicalBytes);
  const result = {
    scanPassed: true,
    processedKey,
    mimeType,
    byteSize: transformed.canonicalBytes.byteLength,
    width: transformed.width,
    height: transformed.height,
    checksum,
  };
  const customMetadata = {
    oweekProcessed: PROCESSED_VERSION,
    assetId,
    mimeType,
    byteSize: String(result.byteSize),
    width: String(result.width),
    height: String(result.height),
    checksum,
  };

  await env.IMAGES_BUCKET.put(`_derived/${processedKey}.thumb.webp`, transformed.thumbnailBytes, {
    httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: { sourceKey: key, assetId, kind: "thumbnail", oweekProcessed: PROCESSED_VERSION },
  });
  await env.IMAGES_BUCKET.put(processedKey, transformed.canonicalBytes, {
    httpMetadata: { contentType: mimeType, cacheControl: "public, max-age=31536000, immutable" },
    customMetadata,
  });
  await notifyReady(env, assetId, result);
  await env.IMAGES_BUCKET.delete(key);
  return "READY";
}

function publicObjectKey(pathname) {
  if (!pathname.startsWith("/assets/")) return null;
  try {
    const key = decodeURIComponent(pathname.slice("/assets/".length));
    if (!key || key.includes("..") || key.includes("\\") || !/^[A-Za-z0-9._/-]+$/.test(key)) return null;
    if (key.startsWith("incoming/") || key.startsWith("_derived/incoming/")) return null;
    return key;
  } catch {
    return null;
  }
}

async function serveAsset(request, env, context, url) {
  const key = publicObjectKey(url.pathname);
  if (!key || !["GET", "HEAD"].includes(request.method)) return null;
  const cacheKey = new Request(`${url.origin}${url.pathname}`, { method: "GET" });
  if (request.method === "GET") {
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;
  }
  const object = await env.IMAGES_BUCKET.get(key);
  if (!object) return json({ error: "Not found" }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Content-Length", String(object.size));
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Access-Control-Allow-Origin", env.PUBLIC_ORIGIN);
  headers.set("X-Content-Type-Options", "nosniff");
  const response = new Response(request.method === "HEAD" ? null : object.body, { headers });
  if (request.method === "GET") context.waitUntil(caches.default.put(cacheKey, response.clone()));
  return response;
}

const worker = {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "oweek-image-processor", version: PROCESSED_VERSION });
    }
    if (request.method === "POST" && url.pathname === "/process") {
      const rawBody = await request.text();
      if (!(await validSignedRequest(request, rawBody, env.ASSET_PROCESSOR_SECRET))) return json({ error: "Unauthorized" }, 401);
      let payload;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return json({ error: "Invalid payload" }, 400);
      }
      if (!payload || typeof payload !== "object" || typeof payload.assetId !== "string" || typeof payload.storageKey !== "string") return json({ error: "Invalid payload" }, 400);
      try {
        const status = await processAsset(payload.assetId, payload.storageKey, env);
        return json({ ok: true, status });
      } catch (error) {
        console.error("image processing failed", { error: error instanceof Error ? error.message : "unknown" });
        return json({ error: "Processing failed" }, 500);
      }
    }
    const assetResponse = await serveAsset(request, env, context, url);
    if (assetResponse) return assetResponse;
    return json({ error: "Not found" }, 404);
  },
};

export default worker;
