import { randomBytes, randomInt } from "node:crypto";

export const ARTWORK_PUBLIC_ID_RANDOM_BYTES = 16;
export const ANONYMOUS_ID_LENGTH = 8;
export const DEFAULT_ANONYMOUS_ID_MAX_ATTEMPTS = 32;

/** Generates an opaque URL-safe address from 128 bits of crypto randomness. */
export function generateArtworkPublicId(): string {
  return randomBytes(ARTWORK_PUBLIC_ID_RANDOM_BYTES).toString("base64url");
}

export interface AnonymousIdGenerationOptions {
  /** The exact product-approved symbols. No fallback alphabet is provided. */
  alphabet: string;
  isTaken: (candidate: string) => boolean | Promise<boolean>;
  maxAttempts?: number;
}

/**
 * Generates an eight-symbol candidate with bounded collision retries.
 * Database uniqueness remains authoritative.
 */
export async function generateAnonymousId(
  options: AnonymousIdGenerationOptions,
): Promise<string> {
  if (!options?.alphabet) {
    throw new Error("ANONYMOUS_ID_PRODUCT_ALPHABET_REQUIRED");
  }
  if (typeof options.isTaken !== "function") {
    throw new Error("ANONYMOUS_ID_UNIQUENESS_CHECK_REQUIRED");
  }

  const symbols = Array.from(options.alphabet);
  if (symbols.length < 2 || new Set(symbols).size !== symbols.length) {
    throw new Error("ANONYMOUS_ID_PRODUCT_ALPHABET_INVALID");
  }

  const maxAttempts =
    options.maxAttempts ?? DEFAULT_ANONYMOUS_ID_MAX_ATTEMPTS;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("ANONYMOUS_ID_MAX_ATTEMPTS_INVALID");
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = Array.from(
      { length: ANONYMOUS_ID_LENGTH },
      () => symbols[randomInt(symbols.length)],
    ).join("");
    if (!(await options.isTaken(candidate))) return candidate;
  }

  throw new Error("ANONYMOUS_ID_UNIQUENESS_EXHAUSTED");
}
