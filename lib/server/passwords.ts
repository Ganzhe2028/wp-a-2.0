import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*+?=";
const INITIAL_PASSWORD_LENGTH = 16;

export function hashLocalPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, 64);
  return `scrypt-v1:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyLocalPassword(plain: string, stored: string): boolean {
  const parts = stored.split(":");
  const [saltHex, hashHex] = parts[0] === "scrypt-v1" ? parts.slice(1) : parts;
  if (!saltHex || !hashHex || !/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) {
    return false;
  }

  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(plain, Buffer.from(saltHex, "hex"), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function generateInitialPassword(length = INITIAL_PASSWORD_LENGTH): string {
  if (!Number.isSafeInteger(length) || length < 16) {
    throw new RangeError("INITIAL_PASSWORD_LENGTH_INVALID");
  }
  return Array.from({ length }, () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]).join("");
}

export function validateProtectedAdminInitialPassword(value: string | undefined): string {
  if (!value) throw new Error("PROTECTED_ADMIN_INITIAL_PASSWORD_REQUIRED");
  const length = Array.from(value).length;
  if (value !== value.trim() || length < 16 || length > 128) {
    throw new Error("PROTECTED_ADMIN_INITIAL_PASSWORD_INVALID");
  }
  return value;
}
