"use client";

import imageCompression from "browser-image-compression";

export type UploadMime = "image/jpeg" | "image/png" | "image/webp";
export type CompressionMode = "standard" | "strong";

export const MAX_UPLOAD_BYTES = 512 * 1024;
export const LARGE_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_SOURCE_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_ACTIVE_UPLOADS = 1;
const WORKER_LIBRARY_PATH = "/vendor/browser-image-compression.js";
const RETRY_DELAYS_MS = [500, 1_200, 2_500];

let activeUploads = 0;
const uploadWaiters: Array<() => void> = [];

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function releaseUploadPermit() {
  activeUploads = Math.max(0, activeUploads - 1);
  uploadWaiters.shift()?.();
}

export async function withUploadPermit<T>(task: () => Promise<T>, onQueued: () => void): Promise<T> {
  if (activeUploads >= MAX_ACTIVE_UPLOADS) {
    onQueued();
    await new Promise<void>((resolve) => uploadWaiters.push(resolve));
  }
  activeUploads += 1;
  try {
    return await task();
  } finally {
    releaseUploadPermit();
  }
}

function detectMime(bytes: Uint8Array): UploadMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export class ImageCompressionTooLargeError extends Error {
  constructor() {
    super("即使加强压缩后，图片仍然超过上传限制，请重新截图或选择另一张图片");
    this.name = "ImageCompressionTooLargeError";
  }
}

export async function compressForUpload(file: File, onProgress: (progress: number) => void, mode: CompressionMode = "standard"): Promise<File> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(new Error("图片压缩时间过长，请重试")), mode === "strong" ? 120_000 : 90_000);
  try {
    const profiles = mode === "strong"
      ? [
          { maxSizeMB: .28, maxWidthOrHeight: 1280, initialQuality: .68, fileType: "image/webp" },
          { maxSizeMB: .3, maxWidthOrHeight: 1200, initialQuality: .7, fileType: "image/jpeg" },
          { maxSizeMB: .22, maxWidthOrHeight: 960, initialQuality: .6, fileType: "image/jpeg" },
        ]
      : [
          { maxSizeMB: .38, maxWidthOrHeight: 1600, initialQuality: .8, fileType: "image/webp" },
          { maxSizeMB: .28, maxWidthOrHeight: 1280, initialQuality: .68, fileType: "image/webp" },
          { maxSizeMB: .3, maxWidthOrHeight: 1200, initialQuality: .7, fileType: "image/jpeg" },
          { maxSizeMB: .22, maxWidthOrHeight: 960, initialQuality: .6, fileType: "image/jpeg" },
        ];
    let encodedAtLeastOnce = false;
    let lastEncodingError: unknown;
    for (const profile of profiles) {
      try {
        const compressed = await imageCompression(file, {
          ...profile,
          useWebWorker: true,
          libURL: new URL(WORKER_LIBRARY_PATH, window.location.origin).toString(),
          signal: controller.signal,
          onProgress: (value) => onProgress(Math.max(0, Math.min(100, Math.round(value)))),
        });
        const bytes = new Uint8Array(await compressed.arrayBuffer());
        const mimeType = detectMime(bytes);
        if (!mimeType) throw new Error("当前图片格式无法识别");
        encodedAtLeastOnce = true;
        if (bytes.byteLength <= MAX_UPLOAD_BYTES) {
          const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
          const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
          return new File([bytes], `${baseName}.${extension}`, { type: mimeType, lastModified: file.lastModified });
        }
      } catch (error) {
        if (controller.signal.aborted) throw error;
        lastEncodingError = error;
      }
    }
    if (!encodedAtLeastOnce && lastEncodingError instanceof Error) throw new Error(`当前浏览器无法处理这张图片：${lastEncodingError.message}`);
    throw new ImageCompressionTooLargeError();
  } finally {
    window.clearTimeout(timeout);
  }
}

function retryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function normalizeRequestError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError"
    ? new Error("网络响应超时，请重试")
    : error;
}

export async function retryUploadRequest<T>(
  task: (signal: AbortSignal) => Promise<T>,
  onRetry: (attempt: number) => void,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      return await task(controller.signal);
    } catch (error) {
      lastError = error;
      const status = errorStatus(error);
      if (attempt === attempts || (status !== null && !retryableStatus(status))) throw normalizeRequestError(error);
      onRetry(attempt + 1);
      await delay(RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]);
    } finally {
      window.clearTimeout(timeout);
    }
  }
  throw normalizeRequestError(lastError);
}

export async function putPresignedImage(
  uploadUrl: string,
  file: File,
  onRetry: (attempt: number) => void,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
        signal: controller.signal,
      });
      if (response.ok) return;
      if (!retryableStatus(response.status)) throw new Error(`图片上传被拒绝（${response.status}）`);
      lastError = new Error(`图片上传暂时不可用（${response.status}）`);
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
    } finally {
      window.clearTimeout(timeout);
    }
    onRetry(attempt + 1);
    await delay(RETRY_DELAYS_MS[attempt - 1]);
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("网络已经断开，请联网后点按对应格子重试");
  if (lastError instanceof DOMException && lastError.name === "AbortError") throw new Error("图片上传超时，请重试");
  if (lastError instanceof TypeError) throw new Error("无法连接图片存储，请检查网络后点按对应格子重试");
  throw lastError instanceof Error ? lastError : new Error("图片上传失败，请重试");
}
