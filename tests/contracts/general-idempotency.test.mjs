import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaUrl = new URL("../../prisma/schema.prisma", import.meta.url);
const migrationUrl = new URL(
  "../../prisma/migrations/20260801210000_add_general_idempotency/migration.sql",
  import.meta.url,
);
const helperUrl = new URL("../../lib/server/idempotency.ts", import.meta.url);

test("general idempotency stores only hashes and encrypted replay data", async () => {
  const [schema, migration, helper] = await Promise.all([
    readFile(schemaUrl, "utf8"),
    readFile(migrationUrl, "utf8"),
    readFile(helperUrl, "utf8"),
  ]);
  assert.match(schema, /model IdempotencyRecord\s*\{/);
  assert.match(schema, /keyHash\s+String\s+@db\.Char\(64\)/);
  assert.match(schema, /requestHash\s+String\s+@db\.Char\(64\)/);
  assert.match(schema, /responseCiphertext\s+String/);
  assert.doesNotMatch(schema, /model IdempotencyRecord[\s\S]*plaintext/i);
  assert.match(migration, /"responseCiphertext" TEXT NOT NULL/);
  assert.match(helper, /createCipheriv\("aes-256-gcm"/);
  assert.match(helper, /createDecipheriv\("aes-256-gcm"/);
  assert.match(helper, /keyHash:\s*sha256\(key\)/);
  assert.match(helper, /REPLAY_WINDOW_MS\s*=\s*15 \* 60 \* 1000/);
});

test("high-risk write routes use transactional idempotency", async () => {
  const routeFiles = [
    "../../app/api/v1/admin/settings/route.ts",
    "../../app/api/v1/admin/settings/apply-preset/route.ts",
    "../../app/api/v1/admin/accounts/import/route.ts",
    "../../app/api/v1/admin/accounts/bulk/route.ts",
    "../../app/api/v1/admin/accounts/[id]/route.ts",
    "../../app/api/v1/admin/accounts/[id]/reset-password/route.ts",
    "../../app/api/v1/assets/presign/route.ts",
    "../../app/api/v1/assets/[assetId]/complete/route.ts",
    "../../app/api/v1/submissions/[section]/draft/route.ts",
  ];
  for (const file of routeFiles) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, /createIdempotencyContext/);
  }
  for (const file of [
    "../../app/api/v1/admin/accounts/bulk/route.ts",
    "../../app/api/v1/admin/accounts/[id]/route.ts",
    "../../app/api/v1/admin/accounts/[id]/reset-password/route.ts",
    "../../app/api/v1/assets/presign/route.ts",
    "../../app/api/v1/assets/[assetId]/complete/route.ts",
    "../../app/api/v1/submissions/[section]/draft/route.ts",
  ]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, /runIdempotentTransaction/);
  }
});

test("Admin API promotes body idempotency keys to the standard header", async () => {
  const source = await readFile(new URL("../../components/admin/admin-api.ts", import.meta.url), "utf8");
  assert.match(source, /headers\.set\("Idempotency-Key", parsed\.idempotencyKey\)/);
});
