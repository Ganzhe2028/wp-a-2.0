import { DAY1_TEMPLATE, DAY3_TEMPLATE } from "@/lib/domain/submission-templates";

const PREVIEW_STORAGE_KEY = "ow-ui-preview";
const PREVIEW_IMAGE = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320"><defs><linearGradient id="a" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#ff5311"/><stop offset="1" stop-color="#ffc7b0"/></linearGradient></defs><rect width="320" height="320" fill="url(#a)"/><circle cx="220" cy="100" r="60" fill="#fff4ee"/><path d="M0 250 110 140l75 75 40-40 95 95v50H0z" fill="#191919"/></svg>`)}`;

function isDevelopment() {
  return process.env.NODE_ENV === "development";
}

export function activateUiPreview() {
  if (isDevelopment() && typeof window !== "undefined") window.sessionStorage.setItem(PREVIEW_STORAGE_KEY, "enabled");
}

export function deactivateUiPreview() {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(PREVIEW_STORAGE_KEY);
}

export function isUiPreviewActive() {
  return isDevelopment()
    && typeof window !== "undefined"
    && (window.location.pathname === "/_preview" || window.sessionStorage.getItem(PREVIEW_STORAGE_KEY) === "enabled");
}

const previewDay1Slots = DAY1_TEMPLATE.slots.map((slot, index) => ({
  slotKey: slot.slotKey,
  assetId: `preview-asset-${index + 1}`,
  imageUrl: PREVIEW_IMAGE,
  crop: { x: 0.5, y: 0.5, scale: 1 },
}));

const previewDay3Bottles = DAY3_TEMPLATE.bottles.map((bottle, index) => ({
  bottleKey: bottle.bottleKey,
  label: bottle.label,
  labelSnapshot: bottle.label,
  level: index % 6,
  isConfirmed: true,
  group: bottle.group,
  groupSubtitle: bottle.groupSubtitle,
}));

const previewSettings = {
  version: 1,
  day1Open: true,
  day3Open: true,
  authoringEnabled: true,
  allowEditing: true,
  showName: true,
  fullProfileVisible: true,
  seniorCanBrowseAll: false,
};

const previewAccounts = [
  { id: "preview-admin", accountCode: "OWK-ADMIN", displayName: "Preview Admin", email: "preview-admin@example.test", role: "ADMIN", groupId: null, groupName: null, status: "ACTIVE", day1Status: "SUBMITTED", day3Status: "SUBMITTED", lastLoginAt: "2026-08-01T08:30:00.000Z", version: 1, anonymousId: "◆◇○□☆△◎※", oidcBound: false, protectedSystemAdmin: true, isSystemInitialAdmin: true },
  { id: "preview-senior", accountCode: "OWK-1001", displayName: "Alex Chen", email: "alex@example.test", role: "SENIOR", groupId: "group-a", groupName: "Senior Group A", status: "ACTIVE", day1Status: "SUBMITTED", day3Status: "DRAFT", lastLoginAt: "2026-07-31T11:20:00.000Z", version: 3, anonymousId: "☆△◎※◆◇○□", oidcBound: true },
  { id: "preview-learner", accountCode: "OWK-2001", displayName: "Lin Wang", email: "lin@example.test", role: "LEARNER", groupId: "group-a", groupName: "Senior Group A", status: "ACTIVE", day1Status: "DRAFT", day3Status: "NOT_STARTED", lastLoginAt: null, version: 2, anonymousId: "○□☆△◎※◆◇", oidcBound: false },
  { id: "preview-archived", accountCode: "OWK-2002", displayName: "Archived Account", email: null, role: "LEARNER", groupId: "group-b", groupName: "Senior Group B", status: "ARCHIVED", day1Status: "NOT_STARTED", day3Status: "NOT_STARTED", lastLoginAt: "2026-07-12T10:00:00.000Z", version: 1, anonymousId: "◎※◆◇○□☆△", oidcBound: false },
] as const;

const previewGallery = [
  { publicId: "preview-artwork", displayTitle: "Alex Chen", roleLabel: "Senior Group", thumbnail: { url: PREVIEW_IMAGE }, sectionStates: { DAY1: "AVAILABLE", DAY3: "AVAILABLE" } },
  { publicId: "preview-artwork-2", displayTitle: "Lin Wang", roleLabel: "Learner", thumbnail: { url: PREVIEW_IMAGE }, sectionStates: { DAY1: "AVAILABLE", DAY3: "NO_CONTENT" } },
  { publicId: "preview-artwork-3", displayTitle: "Yuki Zhao", roleLabel: "Learner", thumbnail: null, sectionStates: { DAY1: "NO_CONTENT", DAY3: "AVAILABLE" } },
];

/**
 * Provides deterministic, browser-only data for visual review. It never reaches
 * a formal API, database, session, or write endpoint.
 */
export function getUiPreviewData(path: string): unknown | undefined {
  if (!isUiPreviewActive()) return undefined;
  const pathname = new URL(path, "https://preview.local").pathname.toLowerCase();

  if (pathname === "/api/v1/home") {
    return {
      identity: { displayTitle: "Preview Student", isAnonymous: false },
      capabilities: { authoringEnabled: true },
      day1: { status: "DRAFT", canEnter: true, canEdit: true, progress: { completed: 9, total: DAY1_TEMPLATE.slots.length }, action: "CONTINUE" },
      day3: { status: "DRAFT", canEnter: true, canEdit: true, progress: { completed: 42, total: DAY3_TEMPLATE.bottles.length }, action: "CONTINUE" },
      browse: { visible: true, canEnter: true, unlockedSections: ["DAY1", "DAY3"] },
    };
  }
  if (pathname === "/api/v1/submissions/day1") return { status: "DRAFT", version: 1, canAuthor: true, template: DAY1_TEMPLATE, slots: previewDay1Slots, publicId: "preview-artwork" };
  if (pathname === "/api/v1/submissions/day3") return { status: "DRAFT", version: 1, canAuthor: true, template: DAY3_TEMPLATE, bottles: previewDay3Bottles, publicId: "preview-artwork" };
  if (pathname === "/api/v1/gallery") return { viewer: { unlockedSections: ["DAY1", "DAY3"], browseScope: "ALL" }, items: previewGallery, nextCursor: null };
  if (pathname.startsWith("/api/v1/artworks/")) {
    return {
      publicId: pathname.split("/").at(-1) || "preview-artwork",
      displayTitle: "Alex Chen",
      isAnonymous: false,
      profileVisibility: "FULL",
      navigation: { canReturnToGallery: true, canNavigateCollection: false },
      sections: {
        DAY1: { state: "AVAILABLE", content: { templateVersion: DAY1_TEMPLATE.templateVersion, slots: previewDay1Slots } },
        DAY3: { state: "AVAILABLE", content: { templateVersion: DAY3_TEMPLATE.templateVersion, bottles: previewDay3Bottles } },
      },
    };
  }
  if (pathname === "/api/v1/auth/logout") return {};
  if (pathname === "/api/v1/admin/session") return { authed: true, account: { id: "preview-admin", accountCode: "OWK-ADMIN", displayName: "Preview Admin", email: "preview-admin@example.test", role: "ADMIN", protectedSystemAdmin: true } };
  if (pathname === "/api/v1/auth/methods") return { localEnabled: true, oidcEnabled: false, oidcReady: false };
  if (pathname === "/api/v1/admin/dashboard") return { phase: "DAY 1 创作", lastSyncedAt: "2026-08-01T08:30:00.000Z", provisionedAccountCount: 48, completion: { day1: { submitted: 29, eligible: 42, percentage: 69 }, day3: { submitted: 16, eligible: 42, percentage: 38 } }, settings: previewSettings };
  if (pathname === "/api/v1/admin/accounts") return { items: previewAccounts, nextCursor: null, groups: [{ id: "group-a", name: "Senior Group A", memberCount: 18 }, { id: "group-b", name: "Senior Group B", memberCount: 11 }] };
  if (pathname === "/api/v1/admin/audit-logs") return { items: [
    { id: "preview-log-1", createdAt: "2026-08-01T08:30:00.000Z", actorLabel: "OWK-ADMIN", action: "SETTINGS_UPDATED", targetType: "EVENT_SETTINGS", targetLabel: "活动设置", summary: "Preview activity settings updated", requestId: "req_preview_0001" },
    { id: "preview-log-2", createdAt: "2026-08-01T07:50:00.000Z", actorLabel: "SYSTEM", action: "SYSTEM_ADMIN_ENSURED", targetType: "USER", targetLabel: "受保护管理员", summary: "Preview system administrator ensured", requestId: "req_preview_0002" },
  ], nextCursor: null, actionOptions: ["SETTINGS_UPDATED", "SYSTEM_ADMIN_ENSURED"] };
  return undefined;
}

export function uiPreviewWriteError() {
  return new Error("UI 预览模式不会保存或上传任何内容。");
}
