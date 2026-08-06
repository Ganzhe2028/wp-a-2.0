import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { EVENT_PRESETS } from "../../lib/domain/presets.ts";
import {
  ANONYMOUS_SYMBOLS,
  generateAccountCode,
  normalizeAccountCode,
} from "../../lib/server/formal-identifiers.ts";
import {
  generateInitialPassword,
  hashLocalPassword,
  validateProtectedAdminInitialPassword,
  verifyLocalPassword,
} from "../../lib/server/passwords.ts";

const schemaUrl = new URL("../../prisma/schema.prisma", import.meta.url);
const migrationUrl = new URL(
  "../../prisma/migrations/20260801120000_add_formal_authentication/migration.sql",
  import.meta.url,
);
const bootstrapUrl = new URL("../../lib/server/bootstrap.ts", import.meta.url);
const importServiceUrl = new URL(
  "../../lib/server/admin-accounts.ts",
  import.meta.url,
);
const idempotencyServiceUrl = new URL(
  "../../lib/server/idempotency.ts",
  import.meta.url,
);
const sessionServiceUrl = new URL(
  "../../lib/server/formal-session.ts",
  import.meta.url,
);
const templateUrl = new URL(
  "../../lib/domain/submission-templates.ts",
  import.meta.url,
);

test("local credentials are salted scrypt hashes and initial passwords are strong", () => {
  const password = generateInitialPassword();
  const firstHash = hashLocalPassword(password);
  const secondHash = hashLocalPassword(password);

  assert.equal(password.length, 16);
  assert.match(firstHash, /^scrypt-v1:[0-9a-f]+:[0-9a-f]+$/);
  assert.equal(firstHash.includes(password), false);
  assert.equal(firstHash === secondHash, false);
  assert.equal(verifyLocalPassword(password, firstHash), true);
  assert.equal(verifyLocalPassword(`${password}x`, firstHash), false);
});

test("generated account codes are normalized, opaque, and collision-resistant in a batch", () => {
  const codes = new Set(Array.from({ length: 256 }, generateAccountCode));
  assert.equal(codes.size, 256);
  for (const code of codes) assert.match(code, /^OWK-[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(normalizeAccountCode(" sophiaxu "), "SophiaXu");
  assert.equal(normalizeAccountCode(" owk-abcd23 "), "OWK-ABCD23");
});

test("anonymous IDs use the exact approved symbol alphabet", () => {
  assert.equal(ANONYMOUS_SYMBOLS, "!@#$%&*+?=");
  assert.equal(new Set(Array.from(ANONYMOUS_SYMBOLS)).size, 10);
});

test("all six event presets explicitly set every visibility and authoring switch", () => {
  assert.deepEqual(Object.keys(EVENT_PRESETS), [
    "DAY1_AUTHORING",
    "DAY3_AUTHORING",
    "PRE_EVENT_BROWSE",
    "RULES_PREP",
    "GAME_IN_PROGRESS",
    "FIND_PACKAGE",
  ]);
  const required = [
    "day1Open",
    "day3Open",
    "authoringEnabled",
    "allowEditing",
    "showName",
    "fullProfileVisible",
    "seniorCanBrowseAll",
  ];
  for (const preset of Object.values(EVENT_PRESETS)) {
    assert.deepEqual(Object.keys(preset).sort(), required.toSorted());
    for (const value of Object.values(preset)) assert.equal(typeof value, "boolean");
  }
  assert.equal(EVENT_PRESETS.RULES_PREP.showName, false);
  assert.equal(EVENT_PRESETS.FIND_PACKAGE.fullProfileVisible, false);
  for (const preset of Object.values(EVENT_PRESETS)) assert.equal(preset.seniorCanBrowseAll, false);
});

test("formal templates are centralized, versioned, and keep the approved dev cardinalities", async () => {
  const source = await readFile(templateUrl, "utf8");
  assert.match(source, /DAY1_TEMPLATE_VERSION\s*=\s*"day1-dev-v1"/);
  assert.match(source, /DAY3_TEMPLATE_VERSION\s*=\s*"day3-dev-v2"/);
  assert.match(source, /DAY1_PROMPTS\.slice\(0, 15\)/);
  assert.match(source, /DAY3_SECTIONS\.flatMap/);
  assert.match(source, /required:\s*true/g);
});

test("formal auth schema stores only credential and session hashes", async () => {
  const [schema, migration] = await Promise.all([
    readFile(schemaUrl, "utf8"),
    readFile(migrationUrl, "utf8"),
  ]);

  assert.match(schema, /accountCode\s+String\s+@unique/);
  assert.match(schema, /protectedSystemAdmin\s+Boolean/);
  assert.match(schema, /model LocalCredential\s*\{/);
  assert.match(schema, /passwordHash\s+String/);
  assert.match(schema, /model OidcIdentity\s*\{/);
  assert.match(schema, /model Session\s*\{/);
  assert.match(schema, /tokenHash\s+String\s+@unique/);
  assert.doesNotMatch(schema, /plain(?:text)?Password/i);

  for (const table of ["LocalCredential", "OidcIdentity", "Session"]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.doesNotMatch(migration, /INSERT\s+INTO/i);
  assert.doesNotMatch(migration, /PROTECTED_ADMIN_INITIAL_PASSWORD|sophiaxu@moonshotacademy\.cn/i);
});

test("protected SophiaXu bootstrap requires a deployment secret and remains rotatable", async () => {
  const source = await readFile(bootstrapUrl, "utf8");
  assert.match(source, /PROTECTED_ADMIN_ACCOUNT_CODE\s*=\s*"SophiaXu"/);
  assert.match(source, /PROTECTED_ADMIN_DISPLAY_NAME\s*=\s*"SophiaXu"/);
  assert.match(source, /PROTECTED_ADMIN_EMAIL\s*=\s*"sophiaxu@moonshotacademy\.cn"/);
  assert.doesNotMatch(source, /PROTECTED_ADMIN_INITIAL_PASSWORD\s*=\s*["']/);
  assert.match(source, /process\.env\.PROTECTED_ADMIN_INITIAL_PASSWORD/);
  assert.match(source, /validateProtectedAdminInitialPassword/);
  assert.match(source, /protectedSystemAdmin:\s*true/);
  assert.match(source, /if \(!credential\)/);
  assert.match(source, /else if \(before && !secureCredentialMarker\)/);
  assert.match(source, /PROTECTED_ADMIN_CREDENTIAL_V1_PROVISIONED/);
  assert.match(source, /tx\.session\.updateMany/);
  assert.match(source, /TransactionIsolationLevel\.Serializable/);

  assert.equal(validateProtectedAdminInitialPassword("A-secure-bootstrap-password-2026"), "A-secure-bootstrap-password-2026");
  assert.throws(() => validateProtectedAdminInitialPassword(undefined), /PROTECTED_ADMIN_INITIAL_PASSWORD_REQUIRED/);
  assert.throws(() => validateProtectedAdminInitialPassword("too-short"), /PROTECTED_ADMIN_INITIAL_PASSWORD_INVALID/);
});

test("batch import forces LEARNER and creates all identity material transactionally", async () => {
  const source = await readFile(importServiceUrl, "utf8");
  const idempotencySource = await readFile(idempotencyServiceUrl, "utf8");
  assert.match(source, /role:\s*"LEARNER"/);
  assert.match(source, /tx\.eventAnonymousId\.create/);
  assert.match(source, /tx\.artworkPublicId\.create/);
  assert.match(source, /localCredential:\s*\{\s*create:\s*\{\s*passwordHash:/s);
  assert.match(source, /runIdempotentTransaction/);
  assert.match(idempotencySource, /TransactionIsolationLevel\.Serializable/);
});

test("formal sessions persist token hashes and support revocation", async () => {
  const source = await readFile(sessionServiceUrl, "utf8");
  assert.match(source, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(source, /tokenHash:\s*hashSessionToken\(token\)/);
  assert.match(source, /revokedAt:\s*new Date\(\)/);
  assert.match(source, /revokeAllUserSessions/);
  assert.doesNotMatch(source, /data:\s*\{[^}]*\btoken\s*[,}]/s);
});
