import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("Day 1 returns before image processing and presents an optimistic local preview", async () => {
  const [completeRoute, editor, upload] = await Promise.all([
    source("../../app/api/v1/assets/[assetId]/complete/route.ts"),
    source("../../app/me/day-1/Day1Client.tsx"),
    source("../../components/student/image-upload.ts"),
  ]);
  assert.match(completeRoute, /after\(\(\) => processAssetAfterResponse/);
  assert.match(editor, /pendingPreviews/);
  assert.match(upload, /maxWidthOrHeight: 1600/);
  assert.match(editor, /后台正在处理/);
});

test("Day 1 compression and direct upload remain responsive on mobile and weak networks", async () => {
  const [editor, upload, packageJson] = await Promise.all([
    source("../../app/me/day-1/Day1Client.tsx"),
    source("../../components/student/image-upload.ts"),
    source("../../package.json"),
  ]);
  assert.match(upload, /WORKER_LIBRARY_PATH = "\/vendor\/browser-image-compression\.js"/);
  assert.match(upload, /MAX_ACTIVE_UPLOADS = 2/);
  assert.match(upload, /putPresignedImage/);
  assert.match(upload, /45_000/);
  assert.match(upload, /无法连接图片存储/);
  assert.match(upload, /ImageCompressionTooLargeError/);
  assert.match(upload, /maxSizeMB: \.28/);
  assert.match(upload, /maxWidthOrHeight: 1280/);
  assert.match(upload, /mode === "strong" \? 90_000 : 45_000/);
  assert.match(upload, /for \(let attempt = 1; attempt <= 3/);
  assert.match(upload, /AbortController/);
  assert.match(editor, /压缩中 \$\{progress\}%/);
  assert.match(editor, /重新上传 \$\{attempt\}\/3/);
  assert.match(editor, /LARGE_SOURCE_IMAGE_BYTES/);
  assert.match(editor, /MAX_SOURCE_IMAGE_BYTES/);
  assert.match(editor, /原图不会发送给第三方压缩网站/);
  assert.match(editor, /压缩后继续/);
  assert.match(packageJson, /sync-browser-assets\.mjs/);
});

test("student dialogs render through a body portal and remain viewport-centered", async () => {
  const [dialog, day1, day3] = await Promise.all([
    source("../../components/student/ViewportDialog.tsx"),
    source("../../app/me/day-1/Day1Client.tsx"),
    source("../../app/me/day-3/Day3Client.tsx"),
  ]);
  assert.match(dialog, /createPortal/);
  assert.match(dialog, /document\.body/);
  assert.match(day1, /<ViewportDialog/);
  assert.match(day3, /<ViewportDialog/);
});

test("Day 3 artwork preserves the two answering themes and subtitles", async () => {
  const [template, route, artwork] = await Promise.all([
    source("../../lib/domain/submission-templates.ts"),
    source("../../app/api/v1/artworks/[publicId]/route.ts"),
    source("../../app/artworks/[publicId]/ArtworkClient.tsx"),
  ]);
  assert.match(template, /groupSubtitle: section\.subtitle/);
  assert.match(route, /groupSubtitle: DAY3_CONFIG/);
  assert.match(artwork, /THEME/);
  assert.match(artwork, /theme\.subtitle/);
});

test("Admin can rename and delete groups without deleting accounts or artworks", async () => {
  const [route, accountsUi] = await Promise.all([
    source("../../app/api/v1/admin/groups/[id]/route.ts"),
    source("../../components/admin/AdminAccounts.tsx"),
  ]);
  assert.match(route, /action: "GROUP_RENAMED"/);
  assert.match(route, /action: "GROUP_DELETED"/);
  assert.match(route, /tx\.user\.updateMany/);
  assert.match(route, /groupId: null/);
  assert.match(route, /tx\.group\.delete/);
  assert.doesNotMatch(route, /tx\.(?:user|submission|asset)\.(?:delete|deleteMany)/);
  assert.match(accountsUi, /GROUP MANAGEMENT/);
  assert.match(accountsUi, /删除组别/);
});

test("NFC export uses canonical exhibition URLs and never the legacy NFC route", async () => {
  const [route, accountsUi] = await Promise.all([
    source("../../app/api/v1/admin/accounts/export-exhibition/route.ts"),
    source("../../components/admin/AdminAccounts.tsx"),
  ]);
  assert.match(route, /\/artworks\//);
  assert.doesNotMatch(route, /\/nfc\//);
  assert.match(route, /status: "ACTIVE"/);
  assert.match(accountsUi, /导出 NFC 展览网址/);
});

test("visible account names keep normal word boundaries across student pages", async () => {
  const [styles, home, browse, artwork] = await Promise.all([
    source("../../app/globals.css"),
    source("../../app/home/HomeClient.tsx"),
    source("../../app/browse/BrowseClient.tsx"),
    source("../../app/artworks/[publicId]/ArtworkClient.tsx"),
  ]);
  assert.match(styles, /\.student-display-name[^}]*word-break: normal/);
  assert.match(styles, /\.student-identity-title[^}]*14vw/);
  for (const page of [home, browse, artwork]) {
    assert.match(page, /student-display-name/);
    assert.doesNotMatch(page, /className="[^"]*break-all[^"]*"[^>]*>\{(?:data\.identity\.)?displayTitle\}/);
  }
});
