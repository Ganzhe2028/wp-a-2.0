import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../../.github/workflows/ci.yml", import.meta.url);
const maintenanceUrl = new URL("../../app/api/internal/maintenance/route.ts", import.meta.url);
const vercelUrl = new URL("../../vercel.json", import.meta.url);

test("CI executes all repository quality gates with pinned runtime", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  assert.match(workflow, /node-version:\s*22\.14\.0/);
  for (const command of ["npm ci", "npm run lint", "npm run typecheck", "npm test", "npm run check:generated", "npm run build", "npm run audit:harness"]) {
    assert.match(workflow, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("maintenance is authenticated, bounded and keeps failed asset cleanup retryable", async () => {
  const [source, vercel] = await Promise.all([readFile(maintenanceUrl, "utf8"), readFile(vercelUrl, "utf8")]);
  assert.match(source, /CRON_SECRET/);
  assert.match(source, /timingSafeEqual/);
  assert.match(source, /take:\s*100/);
  assert.match(source, /await deleteFromR2\(asset\.storageKey\)/);
  assert.match(source, /assetRetries \+= 1/);
  assert.match(source, /idempotencyRecord\.deleteMany/);
  assert.match(source, /rateLimitBucket\.deleteMany/);
  assert.match(vercel, /\/api\/internal\/maintenance/);
});
