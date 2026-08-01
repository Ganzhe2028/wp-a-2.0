import { randomInt } from "node:crypto";

export const ANONYMOUS_SYMBOLS = "!@#$%&*+?=";
const ACCOUNT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateAccountCode(): string {
  const suffix = Array.from(
    { length: 6 },
    () => ACCOUNT_CODE_ALPHABET[randomInt(ACCOUNT_CODE_ALPHABET.length)],
  ).join("");
  return `OWK-${suffix}`;
}

export function normalizeAccountCode(value: string): string {
  const trimmed = value.trim();
  return trimmed.toLowerCase() === "sophiaxu" ? "SophiaXu" : trimmed.toUpperCase();
}
