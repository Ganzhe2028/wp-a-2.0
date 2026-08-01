import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

interface GalleryCursor {
  seed: string;
  after: string | null;
  section: "DAY1" | "DAY3";
  division: "SENIOR" | "LEARNER";
  queryHash: string;
  onlyWithContent: boolean;
  accessScopeHash: string;
  showName: boolean;
  settingsVersion: number;
}

function secret() {
  const value = process.env.SESSION_SECRET?.trim();
  if (!value) throw new Error("Missing required environment variable: SESSION_SECRET");
  return value;
}

export function createGallerySeed(): string {
  return randomBytes(16).toString("base64url");
}

export function galleryShuffleKey(seed: string, value: string): string {
  return createHmac("sha256", seed).update(value).digest("hex");
}

export function encodeGalleryCursor(value: GalleryCursor): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function decodeGalleryCursor(
  token: string,
  expected: Pick<GalleryCursor, "section" | "division" | "queryHash" | "onlyWithContent" | "accessScopeHash" | "showName" | "settingsVersion">,
): GalleryCursor | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const calculated = createHmac("sha256", secret()).update(payload).digest();
  let supplied: Buffer;
  try { supplied = Buffer.from(signature, "base64url"); } catch { return null; }
  if (calculated.length !== supplied.length || !timingSafeEqual(calculated, supplied)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as GalleryCursor;
    return value.section === expected.section
      && value.division === expected.division
      && value.queryHash === expected.queryHash
      && value.onlyWithContent === expected.onlyWithContent
      && value.accessScopeHash === expected.accessScopeHash
      && value.showName === expected.showName
      && value.settingsVersion === expected.settingsVersion
      && (value.after === null || typeof value.after === "string" && value.after.length <= 256)
      ? value
      : null;
  } catch { return null; }
}
