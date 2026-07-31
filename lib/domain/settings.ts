const BLOCKED_LEGACY_PRIVILEGE_SETTINGS = new Set([
  "browseOpen",
  "nfcEnabled",
  "profileComplete",
]);

export function isBlockedLegacyPrivilegeSetting(key: string): boolean {
  return BLOCKED_LEGACY_PRIVILEGE_SETTINGS.has(key);
}

/** Missing, malformed, and failed setting reads all deny access. */
export async function readBooleanSettingFailClosed(
  readValue: () => Promise<string | null | undefined>,
): Promise<boolean> {
  try {
    return (await readValue()) === "true";
  } catch {
    return false;
  }
}
