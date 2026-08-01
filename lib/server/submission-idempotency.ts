import { createHash } from "node:crypto";
import type { FormalSection } from "@/lib/domain/submission-templates";

export interface SubmitResult {
  publicId: string;
  version: number;
}

export type SubmitReplayDecision =
  | { kind: "REPLAY"; data: SubmitResult }
  | { kind: "CONFLICT" }
  | { kind: "NOT_REPLAY" };

export function hashIdempotencyKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashSubmitRequest(section: FormalSection, version: number): string {
  return createHash("sha256")
    .update(JSON.stringify({ section, version, confirm: true }))
    .digest("hex");
}

export function parseSubmitResult(value: unknown): SubmitResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  return typeof result.publicId === "string" && Number.isSafeInteger(result.version)
    ? { publicId: result.publicId, version: result.version as number }
    : null;
}

export function decideSubmitReplay(input: {
  storedKeyHash: string | null;
  storedRequestHash: string | null;
  storedResult: unknown;
  keyHash: string;
  requestHash: string;
}): SubmitReplayDecision {
  if (input.storedKeyHash !== input.keyHash) return { kind: "NOT_REPLAY" };
  if (input.storedRequestHash !== input.requestHash) return { kind: "CONFLICT" };
  const data = parseSubmitResult(input.storedResult);
  return data ? { kind: "REPLAY", data } : { kind: "CONFLICT" };
}
