export type Section = "DAY1" | "DAY3";

/**
 * Every active account owns an addressable artwork page from provisioning time.
 * Submission state controls page content, never whether the page exists.
 */
export type GallerySectionState = "AVAILABLE" | "NO_CONTENT";
export type GalleryBrowseScope = "ALL" | "OWN_GROUP_LEARNERS";

export interface GalleryItemContract {
  publicId: string;
  displayTitle: string;
  roleLabel?: string;
  thumbnail: { url: string } | null;
  sectionStates: Partial<Record<Section, GallerySectionState>>;
}

export interface GalleryPageContract {
  viewer: { unlockedSections: Section[]; browseScope: GalleryBrowseScope };
  items: GalleryItemContract[];
  nextCursor: string | null;
}

export type ArtworkSectionState = "AVAILABLE" | "LOCKED" | "NO_CONTENT";

export type ArtworkIdentityOnlyReason = "NO_CONTENT" | "EVENT_IDENTITY_ONLY";

export interface ArtworkBottleContract {
  bottleKey: string;
  labelSnapshot: string;
  level: number | null;
  isConfirmed: boolean;
  group: string;
  groupSubtitle: string;
}
