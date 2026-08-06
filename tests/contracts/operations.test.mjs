import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../../.github/workflows/ci.yml", import.meta.url);
const productionWorkflowUrl = new URL("../../.github/workflows/deploy-vercel-production.yml", import.meta.url);
const packageUrl = new URL("../../package.json", import.meta.url);
const maintenanceUrl = new URL("../../app/api/internal/maintenance/route.ts", import.meta.url);
const vercelUrl = new URL("../../vercel.json", import.meta.url);

test("CI executes all repository quality gates with pinned runtime", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  assert.match(workflow, /node-version:\s*22\.14\.0/);
  for (const command of ["npm ci", "npm run lint", "npm run typecheck", "npm test", "npm run check:generated", "npm run build", "npm run audit:harness"]) {
    assert.match(workflow, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("production deployment pins executable dependencies and scopes secrets to consuming steps", async () => {
  const [workflow, packageSource] = await Promise.all([
    readFile(productionWorkflowUrl, "utf8"),
    readFile(packageUrl, "utf8"),
  ]);
  const packageJson = JSON.parse(packageSource);

  assert.match(workflow, /actions\/checkout@11bd71901bbe5b1630ceea73d27597364c9af683/);
  assert.match(workflow, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/);
  assert.doesNotMatch(workflow, /npm install --global vercel/);
  assert.match(workflow, /npx --yes vercel@51\.2\.1/);
  assert.doesNotMatch(workflow, /\n    env:\n      VERCEL_TOKEN:/);
  assert.match(workflow, /name: Sync database environment[\s\S]*?env:\n\s+VERCEL_TOKEN:/);
  assert.equal(packageJson.devDependencies.vercel, undefined);
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
