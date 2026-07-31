import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isValidDay3Level,
  isValidDay3Submission,
} from "../../lib/domain/day3-submission.ts";
import {
  ANONYMOUS_ID_LENGTH,
  ARTWORK_PUBLIC_ID_RANDOM_BYTES,
  generateAnonymousId,
  generateArtworkPublicId,
} from "../../lib/domain/formal-identifiers.ts";

const schemaUrl = new URL("../../prisma/schema.prisma", import.meta.url);
const identifiersUrl = new URL(
  "../../lib/domain/formal-identifiers.ts",
  import.meta.url,
);
const migrationUrl = new URL(
  "../../prisma/migrations/20260731120000_add_v11_formal_domain/migration.sql",
  import.meta.url,
);

test("Artwork Public ID has at least 128 bits of cryptographic random input", async () => {
  assert.ok(ARTWORK_PUBLIC_ID_RANDOM_BYTES >= 16);
  const source = await readFile(identifiersUrl, "utf8");
  assert.match(source, /from "node:crypto"/);
  assert.match(
    source,
    /randomBytes\(ARTWORK_PUBLIC_ID_RANDOM_BYTES\)\.toString\("base64url"\)/,
  );

  const ids = new Set(Array.from({ length: 256 }, generateArtworkPublicId));
  assert.equal(ids.size, 256);
  for (const publicId of ids) assert.match(publicId, /^[A-Za-z0-9_-]{22}$/);
});

test("Artwork Public ID generation accepts and embeds no identity input", () => {
  assert.equal(generateArtworkPublicId.length, 0);
  const publicId = generateArtworkPublicId();
  for (const identity of ["user_123", "PERSON-CODE", "student@example.edu"]) {
    assert.equal(publicId.includes(identity), false);
  }
});

test("Anonymous ID requires the product alphabet and always emits eight symbols", async () => {
  assert.equal(ANONYMOUS_ID_LENGTH, 8);
  await assert.rejects(
    generateAnonymousId({ alphabet: "", isTaken: async () => false }),
    /ANONYMOUS_ID_PRODUCT_ALPHABET_REQUIRED/,
  );

  const anonymousId = await generateAnonymousId({
    alphabet: "AB",
    isTaken: async () => false,
  });
  assert.equal(Array.from(anonymousId).length, 8);
  assert.match(anonymousId, /^[AB]{8}$/);
});

test("Anonymous ID collision retries are bounded", async () => {
  let checks = 0;
  await assert.rejects(
    generateAnonymousId({
      alphabet: "AB",
      isTaken: async () => {
        checks += 1;
        return true;
      },
      maxAttempts: 3,
    }),
    /ANONYMOUS_ID_UNIQUENESS_EXHAUSTED/,
  );
  assert.equal(checks, 3);
});

test("Day 3 level distinguishes null and zero and enforces integer range", () => {
  for (const accepted of [null, 0, 5]) assert.equal(isValidDay3Level(accepted), true);
  for (const rejected of [-1, 6, 0.5, "0", Number.NaN]) {
    assert.equal(isValidDay3Level(rejected), false);
    assert.equal(
      isValidDay3Submission({
        isConfirmed: true,
        bottle: { level: rejected },
      }),
      false,
    );
  }
});

test("formal schema contains required enums and compound uniqueness", async () => {
  const schema = await readFile(schemaUrl, "utf8");
  const submissionStatus = schema.match(
    /enum SubmissionStatus\s*\{(?<body>[^}]*)\}/s,
  )?.groups?.body;
  assert.ok(submissionStatus);
  assert.doesNotMatch(submissionStatus, /READ_ONLY/);
  assert.match(schema, /@@unique\(\[eventId, issuer, externalSubject\]\)/);
  assert.match(schema, /@@unique\(\[eventId, userId, section\]\)/);
  assert.match(schema, /@@unique\(\[id, eventId\]\)/);
  assert.match(schema, /@@unique\(\[submissionId, slotKey\]\)/);
  assert.match(
    schema,
    /@relation\(fields: \[assetId, eventId\], references: \[id, eventId\], onDelete: Restrict\)/,
  );
  assert.match(schema, /@@unique\(\[submissionId, bottleKey\]\)/);
  assert.match(schema, /@@unique\(\[eventId, anonymousId\]\)/);
  assert.match(schema, /publicId\s+String\s+@unique/);
});

test("v1.1 migration is additive and contains no production seed data", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.doesNotMatch(
    migration,
    /(?:^|\n)\s*(?:DROP\s+TABLE|ALTER\s+TABLE\s+\S+\s+DROP\s+COLUMN|TRUNCATE|DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+\S+\s+SET)\b/i,
  );
  assert.match(migration, /Day3Bottle_level_range/);
  assert.match(migration, /EventAnonymousId_length/);
  for (const legacyTable of [
    "Person",
    "Image",
    "LocationCard",
    "Favorite",
    "SystemSetting",
  ]) {
    assert.doesNotMatch(migration, new RegExp(`ALTER TABLE "${legacyTable}"`, "i"));
  }
});
