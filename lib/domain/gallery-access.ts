import type { GalleryBrowseScope } from "@/lib/contracts";

type Role = "LEARNER" | "SENIOR" | "ADMIN";

export interface GalleryViewerIdentity {
  userId: string;
  role: Role;
  groupId: string | null;
}

export interface GalleryOwnerIdentity {
  userId: string;
  role: Role;
  groupId: string | null;
}

export function resolveGalleryBrowseScope(
  viewer: GalleryViewerIdentity,
  settings: { seniorCanBrowseAll: boolean },
): GalleryBrowseScope {
  return viewer.role === "SENIOR" && !settings.seniorCanBrowseAll
    ? "OWN_GROUP_LEARNERS"
    : "ALL";
}

export function canViewerAccessArtworkOwner(
  viewer: GalleryViewerIdentity,
  owner: GalleryOwnerIdentity,
  settings: { seniorCanBrowseAll: boolean },
): boolean {
  if (viewer.userId === owner.userId || viewer.role === "ADMIN" || viewer.role === "LEARNER") return true;
  if (viewer.role !== "SENIOR" || settings.seniorCanBrowseAll) return true;
  return owner.role === "LEARNER" && viewer.groupId !== null && viewer.groupId === owner.groupId;
}
