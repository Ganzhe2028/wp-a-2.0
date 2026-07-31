export type ArtworkEntryPoint =
  | "artwork"
  | "gallery"
  | "legacy-nfc"
  | "legacy-package"
  | "legacy-profile"
  | "legacy-location";

export interface ArtworkVisibilityDecision {
  visible: false;
  code: "ARTWORK_NOT_FOUND";
}

/**
 * Fail closed until ArtworkPublicId and Submission exist.
 * Every artwork entry point must use this decision instead of querying Person,
 * LocationCard, Image, NFC codes, package codes, or request context directly.
 */
export function decideArtworkVisibility(
  entryPoint: ArtworkEntryPoint,
  identifier: string,
): ArtworkVisibilityDecision {
  void entryPoint;
  void identifier;
  return { visible: false, code: "ARTWORK_NOT_FOUND" };
}
