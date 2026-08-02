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
  assert.match(upload, /mode === "strong" \? 120_000 : 90_000/);
  assert.match(upload, /fileType: "image\/jpeg"/);
  assert.match(upload, /maxWidthOrHeight: 960/);
  assert.match(upload, /for \(let attempt = 1; attempt <= 3/);
  assert.match(upload, /AbortController/);
  assert.match(editor, /压缩中 \$\{progress\}%/);
  assert.match(editor, /重新上传 \$\{attempt\}\/3/);
  assert.match(editor, /LARGE_SOURCE_IMAGE_BYTES/);
  assert.match(editor, /MAX_SOURCE_IMAGE_BYTES/);
  assert.match(editor, /原图不会发送给第三方压缩网站/);
  assert.match(editor, /压缩后继续/);
  assert.match(editor, /failureKind: "too-large"/);
  assert.match(editor, /请换一张/);
  assert.match(packageJson, /sync-browser-assets\.mjs/);
});

test("Day 1 display uses processed thumbnails and recovers transient mobile image failures", async () => {
  const [r2, submissionRoute, artworkRoute, editor, artwork, resilientImage] = await Promise.all([
    source("../../lib/r2.ts"),
    source("../../app/api/v1/submissions/[section]/route.ts"),
    source("../../app/api/v1/artworks/[publicId]/route.ts"),
    source("../../app/me/day-1/Day1Client.tsx"),
    source("../../app/artworks/[publicId]/ArtworkClient.tsx"),
    source("../../components/student/ResilientImage.tsx"),
  ]);
  assert.match(r2, /_derived\/\$\{key\}\.thumb\.webp/);
  assert.match(submissionRoute, /getThumbnailUrl/);
  assert.match(artworkRoute, /getThumbnailUrl/);
  assert.match(editor, /<ResilientImage/);
  assert.match(artwork, /<ResilientImage/);
  assert.match(resilientImage, /MAX_AUTOMATIC_RETRIES = 2/);
  assert.match(resilientImage, /ow_image_retry/);
  assert.match(resilientImage, /loading=\{eager \? "eager" : "lazy"\}/);
  assert.match(resilientImage, /图片暂时无法显示，请刷新重试/);
});

test("submitted Day 1 and Day 3 can generate complete saveable share posters", async () => {
  const [share, day1, day3] = await Promise.all([
    source("../../components/student/ArtworkShareButton.tsx"),
    source("../../app/me/day-1/Day1Client.tsx"),
    source("../../app/me/day-3/Day3Client.tsx"),
  ]);
  assert.match(day1, /<ArtworkShareButton section="DAY1" slots=\{slots\}/);
  assert.match(day3, /<ArtworkShareButton section="DAY3" bottles=\{bottles\}/);
  assert.match(day1, /grid grid-cols-2/);
  assert.match(day3, /grid grid-cols-2/);
  assert.match(share, /drawDay1Poster/);
  assert.match(share, /DAY1_TEMPLATE\.slots/);
  assert.match(share, /const DAY1_MOSAIC_LAYOUT: readonly Day1MosaicTile\[\] = \[/);
  assert.match(share, /DAY1_TEMPLATE\.slots\.length !== DAY1_MOSAIC_LAYOUT\.length/);
  assert.match(share, /context\.fillText\("It's me"/);
  assert.match(share, /拼贴分享图已生成/);
  assert.match(share, /drawDay3Poster/);
  assert.match(share, /DAY3_TEMPLATE\.bottles/);
  assert.match(share, /studentApi<HomeIdentityResponse>\("\/api\/v1\/home"\)/);
  assert.match(share, /canvas\.toBlob/);
  assert.match(share, /navigator\.canShare/);
  assert.match(share, /navigator\.share/);
  assert.match(share, /长图已生成/);
  assert.match(share, /系统分享/);
  assert.match(share, /download=\{preview\.filename\}/);
  assert.match(share, /长按下方图片/);
  assert.doesNotMatch(share, /html2canvas|dom-to-image/);
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

test("NFC export uses the shared account selection and canonical exhibition URLs", async () => {
  const [route, accountsUi] = await Promise.all([
    source("../../app/api/v1/admin/accounts/export-exhibition/route.ts"),
    source("../../components/admin/AdminAccounts.tsx"),
  ]);
  assert.match(route, /\/artworks\//);
  assert.doesNotMatch(route, /\/nfc\//);
  assert.match(route, /status: "ACTIVE"/);
  assert.match(route, /export async function POST\(request: Request\)/);
  assert.match(route, /id: \{ in: accountIds \}/);
  assert.match(accountsUi, /selectedAccounts\.map\(\(account\) => account\.id\)/);
  assert.match(accountsUi, /selectedAreAllActive/);
  assert.match(accountsUi, /导出所选 NFC/);
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
