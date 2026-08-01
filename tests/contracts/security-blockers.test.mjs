import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { decideAccountDeletion } from "../../lib/domain/account-lifecycle.ts";
import { decideArtworkVisibility } from "../../lib/domain/artwork-access.ts";
import { createSafeArtworkPresentation } from "../../lib/domain/artwork-presentation.ts";
import { isValidDay3Submission } from "../../lib/domain/day3-submission.ts";
import {
  isBlockedLegacyPrivilegeSetting,
  readBooleanSettingFailClosed,
} from "../../lib/domain/settings.ts";

const TEST_CHINESE_NAME = "测试用户真名";
const TEST_ENGLISH_NAME = "Real Test Name";
const TEST_SORT_KEY = "real-test-name-sort";

test("NFC and Package legacy entries fail closed without special access", () => {
  assert.deepEqual(decideArtworkVisibility("legacy-nfc", "nfc-code"), {
    visible: false,
    code: "ARTWORK_NOT_FOUND",
  });
  assert.deepEqual(decideArtworkVisibility("legacy-package", "package-code"), {
    visible: false,
    code: "ARTWORK_NOT_FOUND",
  });
});

test("artwork entry pages cannot query legacy data stores directly", async () => {
  const failClosedLegacyEntries = [
    "../../app/nfc/[code]/page.tsx",
    "../../app/package/[code]/page.tsx",
  ];

  for (const routeFile of failClosedLegacyEntries) {
    const source = await readFile(new URL(routeFile, import.meta.url), "utf8");
    assert.match(source, /decideArtworkVisibility/);
    assert.doesNotMatch(source, /prisma\.(?:person|locationCard|image)/);
  }

  const formalFiles = [
    "../../app/artworks/[publicId]/page.tsx",
    "../../app/artworks/[publicId]/ArtworkClient.tsx",
    "../../app/api/v1/artworks/[publicId]/route.ts",
  ];
  for (const routeFile of formalFiles) {
    const source = await readFile(new URL(routeFile, import.meta.url), "utf8");
    assert.doesNotMatch(source, /prisma\.(?:person|locationCard|image)/);
  }

  const client = await readFile(
    new URL("../../app/artworks/[publicId]/ArtworkClient.tsx", import.meta.url),
    "utf8",
  );
  assert.match(client, /\/api\/v1\/artworks\//);
});

test("Gallery and direct Artwork URLs use the same visibility decision", () => {
  assert.deepEqual(
    decideArtworkVisibility("gallery", "public-id"),
    decideArtworkVisibility("artwork", "public-id"),
  );
});

test("anonymous serialization contains no real name, sorting key, or group", () => {
  const serialized = JSON.stringify(
    createSafeArtworkPresentation({
      showName: false,
      chineseName: TEST_CHINESE_NAME,
      englishName: TEST_ENGLISH_NAME,
      displayName: `${TEST_ENGLISH_NAME} (${TEST_CHINESE_NAME})`,
      nameSortKey: TEST_SORT_KEY,
      groupName: "Identity Revealing Group",
    }),
  );

  assert.equal(serialized.includes(TEST_CHINESE_NAME), false);
  assert.equal(serialized.includes(TEST_ENGLISH_NAME), false);
  assert.equal(serialized.includes(TEST_SORT_KEY), false);
  assert.equal(serialized.includes("group"), false);
  assert.deepEqual(JSON.parse(serialized), { displayTitle: "匿名作品" });
});

test("missing, malformed, and failed settings do not expand access", async () => {
  assert.equal(await readBooleanSettingFailClosed(async () => null), false);
  assert.equal(await readBooleanSettingFailClosed(async () => "TRUE"), false);
  assert.equal(await readBooleanSettingFailClosed(async () => "invalid"), false);
  assert.equal(
    await readBooleanSettingFailClosed(async () => {
      throw new Error("database unavailable");
    }),
    false,
  );
  assert.equal(await readBooleanSettingFailClosed(async () => "true"), true);

  for (const key of ["browseOpen", "nfcEnabled", "profileComplete"]) {
    assert.equal(isBlockedLegacyPrivilegeSetting(key), true);
  }
});

test("normal account deletion is disabled and route has no physical delete", async () => {
  assert.deepEqual(decideAccountDeletion(), {
    allowed: false,
    code: "FORBIDDEN",
  });

  const routeSource = await readFile(
    new URL("../../app/api/admin/persons/route.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(routeSource, /prisma\.person\.(?:delete|deleteMany)\s*\(/);

  const formalRoutes = await Promise.all([
    "../../app/api/v1/admin/accounts/[id]/route.ts",
    "../../app/api/v1/admin/accounts/bulk/route.ts",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  for (const source of formalRoutes) {
    assert.doesNotMatch(source, /(?:prisma|tx)\.user\.(?:delete|deleteMany)\s*\(/);
  }
});

test("admin account list puts archived accounts last and can hide them", async () => {
  const [routeSource, uiSource] = await Promise.all([
    readFile(new URL("../../app/api/v1/admin/accounts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../components/admin/AdminAccounts.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(routeSource, /\{ status: "asc" \}/);
  assert.match(uiSource, /params\.set\("status", "ACTIVE"\)/);
  assert.match(uiSource, /隐藏已归档账号/);
});

test("Day 3 rejects structurally empty submissions", () => {
  for (const submission of [
    {},
    [],
    { bottle: null },
    { bottle: "   " },
    { bottles: [null, ""] },
    { bottle: { level: null } },
    { isConfirmed: false, bottle: { level: 2 } },
    { isConfirmed: true, bottle: { level: null } },
  ]) {
    assert.equal(isValidDay3Submission(submission), false);
  }
});

test("Day 3 accepts meaningful confirmed content, including explicit level zero", () => {
  assert.equal(
    isValidDay3Submission({ isConfirmed: true, bottle: { level: 0 } }),
    true,
  );
  assert.equal(
    isValidDay3Submission({ isConfirmed: true, bottle: { level: 3 } }),
    true,
  );
});
