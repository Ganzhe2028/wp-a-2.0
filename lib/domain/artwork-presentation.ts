const ANONYMOUS_DISPLAY_TITLE = "匿名作品";

export interface ArtworkIdentityInput {
  showName: boolean;
  chineseName?: string | null;
  englishName?: string | null;
  displayName?: string | null;
  nameSortKey?: string | null;
  groupName?: string | null;
}

export interface SafeArtworkPresentation {
  displayTitle: string;
}

/**
 * Public artwork serialization is allowlisted. Identity and sorting fields are
 * never copied into anonymous output, even if a caller fetched them by mistake.
 */
export function createSafeArtworkPresentation(
  input: ArtworkIdentityInput,
): SafeArtworkPresentation {
  if (!input.showName) {
    return { displayTitle: ANONYMOUS_DISPLAY_TITLE };
  }

  const displayTitle =
    input.displayName?.trim() ||
    input.englishName?.trim() ||
    input.chineseName?.trim() ||
    "作品";

  return { displayTitle };
}
