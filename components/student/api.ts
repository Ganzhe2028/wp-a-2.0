"use client";

import { getUiPreviewData, isUiPreviewActive, uiPreviewWriteError } from "@/lib/preview/ui-preview";

export type Section = "DAY1" | "DAY3";
export type SubmissionStatus = "NOT_STARTED" | "DRAFT" | "SUBMITTED";

interface ApiEnvelope<T> {
  data: T;
  requestId?: string;
}

interface ApiErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown } | string;
  requestId?: string;
}

export class StudentApiError extends Error {
  status: number;
  code: string;
  requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = "StudentApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export async function studentApi<T>(path: string, init?: RequestInit): Promise<T> {
  if (isUiPreviewActive()) {
    if (init?.method && init.method !== "GET") throw uiPreviewWriteError();
    const preview = getUiPreviewData(path);
    if (preview !== undefined) return preview as T;
  }
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T> & ApiErrorEnvelope;
  if (!response.ok) {
    const structured = typeof payload.error === "object" ? payload.error : undefined;
    const code = structured?.code || (response.status === 401 ? "UNAUTHENTICATED" : "REQUEST_FAILED");
    const message = structured?.message || (typeof payload.error === "string" ? payload.error : "暂时无法完成操作");
    throw new StudentApiError(response.status, code, message, payload.requestId);
  }
  return payload.data;
}

import { safeReturnTo } from "@/lib/safe-return-to";

export function loginUrl(returnTo: string) {
  return `/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`;
}

export function describeApiError(error: unknown) {
  if (!(error instanceof StudentApiError)) return "网络连接失败，请稍后重试";
  const suffix = error.requestId ? ` · ${error.requestId.slice(-8)}` : "";
  return `${error.message}${suffix}`;
}

export function isReadOnlyError(error: unknown) {
  return error instanceof StudentApiError && ["AUTHORING_CLOSED", "DAY_CLOSED", "EDITING_DISABLED"].includes(error.code);
}

export function newIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
