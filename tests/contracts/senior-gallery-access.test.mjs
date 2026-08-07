import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canViewerAccessArtworkOwner,
  resolveGalleryBrowseScope,
} from "../../lib/domain/gallery-access.ts";
import { decideAuthoring } from "../../lib/domain/authoring.ts";

const senior = { userId: "senior-a", role: "SENIOR", groupId: "group-a" };
const learnerSameGroup = { userId: "learner-a", role: "LEARNER", groupId: "group-a" };
const learnerOtherGroup = { userId: "learner-b", role: "LEARNER", groupId: "group-b" };
const seniorSameGroup = { userId: "senior-b", role: "SENIOR", groupId: "group-a" };
const counselor = { userId: "counselor-a", role: "COUNSELOR", groupId: null };
const counselorOwner = { userId: "counselor-b", role: "COUNSELOR", groupId: "group-b" };

test("Senior defaults to own-group Learners and cannot bypass with a direct artwork URL", () => {
  const settings = { seniorCanBrowseAll: false };
  assert.equal(resolveGalleryBrowseScope(senior, settings), "OWN_GROUP_LEARNERS");
  assert.equal(canViewerAccessArtworkOwner(senior, learnerSameGroup, settings), true);
  assert.equal(canViewerAccessArtworkOwner(senior, learnerOtherGroup, settings), false);
  assert.equal(canViewerAccessArtworkOwner(senior, seniorSameGroup, settings), false);
  assert.equal(canViewerAccessArtworkOwner(senior, counselorOwner, settings), false);
  assert.equal(canViewerAccessArtworkOwner(senior, senior, settings), true);
  assert.equal(
    canViewerAccessArtworkOwner({ ...senior, groupId: null }, learnerSameGroup, settings),
    false,
  );
});

test("Admin switch widens Senior scope while Admin, Learner, and Counselor remain unrestricted", () => {
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
  assert.equal(resolveGalleryBrowseScope(counselor, { seniorCanBrowseAll: false }), "ALL");
  assert.equal(canViewerAccessArtworkOwner(counselor, learnerOtherGroup, { seniorCanBrowseAll: false }), true);
  assert.equal(canViewerAccessArtworkOwner(counselor, seniorSameGroup, { seniorCanBrowseAll: false }), true);
  assert.equal(canViewerAccessArtworkOwner(counselor, counselorOwner, { seniorCanBrowseAll: false }), true);
});

test("Counselor can author under the same event switches as Learner and Senior", () => {
  assert.deepEqual(
    decideAuthoring({
      role: "COUNSELOR",
      section: "DAY1",
      status: "DRAFT",
      settings: { day1Open: true, day3Open: false, authoringEnabled: true, allowEditing: false },
    }),
    { allowed: true },
  );
});

test("Counselor is persisted as a role and grouped into the existing Senior gallery division", async () => {
  const [schema, migration, galleryRoute, accountsRoute, bulkRoute, accountsUi, browseUi, dashboardRoute] = await Promise.all([
    readFile(new URL("../../prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(new URL("../../prisma/migrations/20260807120000_add_counselor_role/migration.sql", import.meta.url), "utf8"),
    readFile(new URL("../../app/api/v1/gallery/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/api/v1/admin/accounts/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/api/v1/admin/accounts/bulk/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../components/admin/AdminAccounts.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/browse/BrowseClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/api/v1/admin/dashboard/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /enum UserRole\s*\{[^}]*COUNSELOR[^}]*\}/s);
  assert.match(migration, /ADD VALUE IF NOT EXISTS 'COUNSELOR' AFTER 'SENIOR'/);
  assert.match(galleryRoute, /in: \["SENIOR", "COUNSELOR"\]/);
  assert.match(accountsRoute, /role !== "COUNSELOR"/);
  assert.match(bulkRoute, /"LEARNER", "SENIOR", "COUNSELOR", "ADMIN"/);
  assert.match(accountsUi, /\["LEARNER", "SENIOR", "COUNSELOR", "ADMIN"\]/);
  assert.match(browseUi, /title="SENIOR GROUP"/);
  assert.doesNotMatch(browseUi, /more\("COUNSELOR"\)/);
  assert.match(dashboardRoute, /\["LEARNER", "SENIOR", "COUNSELOR"\]/);
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
