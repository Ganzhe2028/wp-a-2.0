import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const previewPageUrl = new URL("../../app/%255Fpreview/page.tsx", import.meta.url);
const previewDataUrl = new URL("../../lib/preview/ui-preview.ts", import.meta.url);
const studentApiUrl = new URL("../../components/student/api.ts", import.meta.url);
const adminApiUrl = new URL("../../components/admin/admin-api.ts", import.meta.url);
const day1ClientUrl = new URL("../../app/me/day-1/Day1Client.tsx", import.meta.url);
const globalStylesUrl = new URL("../../app/globals.css", import.meta.url);

test("UI preview is development-only, browser-local, and read-only", async () => {
  const [page, data, studentApi, adminApi] = await Promise.all([
    readFile(previewPageUrl, "utf8"),
    readFile(previewDataUrl, "utf8"),
    readFile(studentApiUrl, "utf8"),
    readFile(adminApiUrl, "utf8"),
  ]);

  assert.match(page, /process\.env\.NODE_ENV\s*!==\s*"development"\)\s*notFound\(\)/);
  assert.match(data, /sessionStorage/);
  assert.match(data, /never reaches\s+\* a formal API, database, session, or write endpoint/);
  assert.match(studentApi, /isUiPreviewActive\(\)/);
  assert.match(studentApi, /uiPreviewWriteError\(\)/);
  assert.match(adminApi, /PREVIEW_READ_ONLY/);
});

test("Day 1 collage keeps template crop ratios out of its grid layout", async () => {
  const [day1Client, globalStyles] = await Promise.all([
    readFile(day1ClientUrl, "utf8"),
    readFile(globalStylesUrl, "utf8"),
  ]);

  assert.match(day1Client, /<CropDialog[^>]*aspectRatio=\{activeCrop\.config\.aspectRatio\}/);
  assert.doesNotMatch(day1Client, /className=\{`student-slot[^`]*`\}\s+style=\{\{ aspectRatio: config\.aspectRatio \}\}/);
  assert.match(globalStyles, /\.student-slot:not\(\.student-slot-0\):not\(\.student-slot-3\),\s+\.student-artwork-slot:not\(\.student-slot-0\):not\(\.student-slot-3\) \{ aspect-ratio: 4 \/ 3; \}/);
  assert.match(globalStyles, /\.student-artwork-slot \{ margin: 0; \}/);
});

test("Day 1 cropping starts from the complete image and stays consistent in share posters", async () => {
  const [day1Client, globalStyles, shareButton] = await Promise.all([
    readFile(day1ClientUrl, "utf8"),
    readFile(globalStylesUrl, "utf8"),
    readFile(new URL("../../components/student/ArtworkShareButton.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(globalStyles, /\.student-crop-window img[^}]*object-fit: contain/s);
  assert.match(day1Client, /100% 会显示完整图片/);
  assert.match(day1Client, /type="range" min="1" max="3" step="0\.05"/);
  assert.match(day1Client, /恢复完整图片/);
  assert.match(day1Client, /onPointerCancel=\{stopDragging\}/);
  assert.match(shareButton, /function drawCroppedImage/);
  assert.match(shareButton, /Math\.min\(width \/ image\.naturalWidth, height \/ image\.naturalHeight\)/);
  assert.doesNotMatch(shareButton, /function drawImageCover/);
});
