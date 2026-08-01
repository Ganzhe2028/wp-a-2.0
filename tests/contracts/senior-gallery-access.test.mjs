import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canViewerAccessArtworkOwner,
  resolveGalleryBrowseScope,
} from "../../lib/domain/gallery-access.ts";

const senior = { userId: "senior-a", role: "SENIOR", groupId: "group-a" };
const learnerSameGroup = { userId: "learner-a", role: "LEARNER", groupId: "group-a" };
const learnerOtherGroup = { userId: "learner-b", role: "LEARNER", groupId: "group-b" };
const seniorSameGroup = { userId: "senior-b", role: "SENIOR", groupId: "group-a" };

test("Senior defaults to own-group Learners and cannot bypass with a direct artwork URL", () => {
  const settings = { seniorCanBrowseAll: false };
  assert.equal(resolveGalleryBrowseScope(senior, settings), "OWN_GROUP_LEARNERS");
  assert.equal(canViewerAccessArtworkOwner(senior, learnerSameGroup, settings), true);
  assert.equal(canViewerAccessArtworkOwner(senior, learnerOtherGroup, settings), false);
  assert.equal(canViewerAccessArtworkOwner(senior, seniorSameGroup, settings), false);
  assert.equal(canViewerAccessArtworkOwner(senior, senior, settings), true);
  assert.equal(
    canViewerAccessArtworkOwner({ ...senior, groupId: null }, learnerSameGroup, settings),
    false,
  );
});

test("Admin switch widens Senior scope while Admin and Learner remain unrestricted", () => {
  const widened = { seniorCanBrowseAll: true };
  assert.equal(resolveGalleryBrowseScope(senior, widened), "ALL");
  assert.equal(canViewerAccessArtworkOwner(senior, learnerOtherGroup, widened), true);
  assert.equal(canViewerAccessArtworkOwner(senior, seniorSameGroup, widened), true);
  assert.equal(
    canViewerAccessArtworkOwner(
      { userId: "admin", role: "ADMIN", groupId: null },
      learnerOtherGroup,
      { seniorCanBrowseAll: false },
    ),
    true,
  );
  assert.equal(
    canViewerAccessArtworkOwner(
      { userId: "learner-c", role: "LEARNER", groupId: null },
      learnerOtherGroup,
      { seniorCanBrowseAll: false },
    ),
    true,
  );
});

test("Senior scope is persisted, audited, cursor-bound, and exposed in Admin UI", async () => {
  const [migration, settingsService, galleryRoute, artworkRoute, dashboard, groupRoute, accounts] = await Promise.all([
    readFile(new URL("../../prisma/migrations/20260801233000_add_senior_browse_scope/migration.sql", import.meta.url), "utf8"),
    readFile(new URL("../../lib/server/event-settings-admin.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/api/v1/gallery/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/api/v1/artworks/[publicId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../components/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/api/v1/admin/groups/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../components/admin/AdminAccounts.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /"seniorCanBrowseAll" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(settingsService, /"seniorCanBrowseAll"/);
  assert.match(galleryRoute, /groupId: context\.viewer\.groupId/);
  assert.match(galleryRoute, /accessScopeHash/);
  assert.match(artworkRoute, /canViewerAccessArtworkOwner/);
  assert.match(dashboard, /Senior 可浏览全部主页/);
  assert.match(groupRoute, /action: "GROUP_CREATED"/);
  assert.match(groupRoute, /runIdempotentTransaction/);
  assert.match(accounts, /创建组别/);
});
