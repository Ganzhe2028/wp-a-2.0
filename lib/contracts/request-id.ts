import { randomUUID } from "node:crypto";

export const REQUEST_ID_PATTERN = /^req_[0-9a-f]{32}$/;

export function createRequestId(): string {
  return `req_${randomUUID().replaceAll("-", "")}`;
}

export function isRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}