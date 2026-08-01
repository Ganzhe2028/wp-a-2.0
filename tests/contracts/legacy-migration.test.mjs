import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaUrl = new URL("../../prisma/schema.prisma", import.meta.url);
const migrationUrl = new URL("../../prisma/migrations/20260801220000_add_legacy_person_links/migration.sql", import.meta.url);
const scriptUrl = new URL("../../scripts/migrate-legacy-persons.ts", import.meta.url);

test("legacy migration requires an explicit reversible mapping", async () => {
  const [schema, migration, script] = await Promise.all([readFile(schemaUrl, "utf8"), readFile(migrationUrl, "utf8"), readFile(scriptUrl, "utf8")]);
  assert.match(schema, /model LegacyPersonLink/);
  assert.match(schema, /legacyPersonId\s+String\s+@unique/);
  assert.match(schema, /userId\s+String\s+@unique/);
  assert.match(migration, /CREATE TABLE "LegacyPersonLink"/);
  assert.match(script, /--apply/);
  assert.match(script, /--rollback/);
  assert.match(script, /TransactionIsolationLevel\.Serializable/);
  assert.doesNotMatch(script, /where:\s*\{\s*(?:englishName|chineseName|username|email):/);
});

test("legacy migration preserves content until exact transformation rules exist", async () => {
  const script = await readFile(scriptUrl, "utf8");
  assert.match(script, /legacyContentCount/);
  assert.doesNotMatch(script, /person\.update|person\.delete|image\.delete/);
  assert.doesNotMatch(script, /externalSubject/);
});
