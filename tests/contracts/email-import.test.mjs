import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serviceUrl = new URL("../../lib/server/admin-email-import.ts", import.meta.url);
const routeUrl = new URL("../../app/api/v1/admin/accounts/import-emails/route.ts", import.meta.url);

test("email import matches by account code and fails the whole batch on conflicts", async () => {
  const [service, route] = await Promise.all([readFile(serviceUrl, "utf8"), readFile(routeUrl, "utf8")]);
  assert.match(service, /accountCode:\s*\{\s*in:/);
  assert.match(service, /DISPLAY_NAME_MISMATCH/);
  assert.match(service, /EMAIL_IN_USE/);
  assert.match(service, /OIDC_ALREADY_BOUND/);
  assert.doesNotMatch(service, /where:\s*\{\s*displayName:/);
  assert.match(route, /TransactionIsolationLevel\.Serializable/);
  assert.match(route, /EmailImportConflictError/);
  assert.match(route, /runIdempotentTransaction/);
});

test("email import audit never stores raw email values", async () => {
  const service = await readFile(serviceUrl, "utf8");
  assert.match(service, /ACCOUNT_EMAIL_PROVISIONED/);
  assert.match(service, /before:\s*\{\s*emailProvisioned:/);
  assert.match(service, /after:\s*\{\s*emailProvisioned:\s*true/);
  assert.doesNotMatch(service, /before:\s*\{\s*email:/);
  assert.doesNotMatch(service, /after:\s*\{\s*email:/);
});
