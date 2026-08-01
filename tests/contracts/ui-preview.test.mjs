import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const previewPageUrl = new URL("../../app/%255Fpreview/page.tsx", import.meta.url);
const previewDataUrl = new URL("../../lib/preview/ui-preview.ts", import.meta.url);
const studentApiUrl = new URL("../../components/student/api.ts", import.meta.url);
const adminApiUrl = new URL("../../components/admin/admin-api.ts", import.meta.url);

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
