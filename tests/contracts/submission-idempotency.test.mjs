import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  decideSubmitReplay,
  hashIdempotencyKey,
  hashSubmitRequest,
} from "../../lib/server/submission-idempotency.ts";

const migrationUrl = new URL(
  "../../prisma/migrations/20260801190000_add_submission_idempotency/migration.sql",
  import.meta.url,
);
const submitRouteUrl = new URL(
  "../../app/api/v1/submissions/[section]/submit/route.ts",
  import.meta.url,
);
const auditRouteUrl = new URL(
  "../../app/api/v1/admin/audit-logs/route.ts",
  import.meta.url,
);

test("submission replay hashes raw keys and returns the original result", () => {
  const rawKey = "browser-generated-idempotency-key";
  const keyHash = hashIdempotencyKey(rawKey);
  const requestHash = hashSubmitRequest("DAY1", 4);
  const original = { publicId: "opaque-public-id", version: 5 };

  assert.match(keyHash, /^[0-9a-f]{64}$/);
  assert.equal(keyHash.includes(rawKey), false);
  assert.deepEqual(
    decideSubmitReplay({
      storedKeyHash: keyHash,
      storedRequestHash: requestHash,
      storedResult: original,
      keyHash,
      requestHash,
    }),
    { kind: "REPLAY", data: original },
  );
});

test("reusing an idempotency key for a different submit request conflicts", () => {
  const keyHash = hashIdempotencyKey("same-key");
  assert.deepEqual(
    decideSubmitReplay({
      storedKeyHash: keyHash,
      storedRequestHash: hashSubmitRequest("DAY1", 2),
      storedResult: { publicId: "opaque", version: 3 },
      keyHash,
      requestHash: hashSubmitRequest("DAY1", 3),
    }),
    { kind: "CONFLICT" },
  );
  assert.deepEqual(
    decideSubmitReplay({
      storedKeyHash: hashIdempotencyKey("first-key"),
      storedRequestHash: hashSubmitRequest("DAY1", 2),
      storedResult: { publicId: "opaque", version: 3 },
      keyHash: hashIdempotencyKey("second-key"),
      requestHash: hashSubmitRequest("DAY1", 2),
    }),
    { kind: "NOT_REPLAY" },
  );
});

test("submission idempotency state is persisted in the same update as SUBMITTED", async () => {
  const [migration, route] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(submitRouteUrl, "utf8"),
  ]);
  assert.match(migration, /"submitIdempotencyKeyHash" CHAR\(64\)/);
  assert.match(migration, /"submitRequestHash" CHAR\(64\)/);
  assert.match(migration, /"submitResult" JSONB/);
  assert.doesNotMatch(migration, /DROP|DELETE|TRUNCATE/i);
  assert.match(route, /status:\s*"SUBMITTED"[\s\S]*submitIdempotencyKeyHash:\s*keyHash/);
  assert.match(route, /Idempotency-Replayed/);
  assert.match(route, /error\.code === "P2034"/);
});

test("Admin audit API supports bounded stable cursor and time filtering", async () => {
  const route = await readFile(auditRouteUrl, "utf8");
  assert.match(route, /const PAGE_SIZE = 100/);
  assert.match(route, /fromValue/);
  assert.match(route, /toValue/);
  assert.match(route, /createdAt:\s*\{/);
  assert.match(route, /cursor:\s*\{ id: cursor \}/);
  assert.match(route, /orderBy:\s*\[\{ createdAt: "desc" \}, \{ id: "desc" \}\]/);
  assert.match(route, /take:\s*PAGE_SIZE \+ 1/);
  assert.match(route, /adminAuditLog\.groupBy/);
});
