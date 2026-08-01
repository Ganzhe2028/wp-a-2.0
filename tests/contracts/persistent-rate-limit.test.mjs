import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const helperUrl = new URL("../../lib/server/persistent-rate-limit.ts", import.meta.url);
const schemaUrl = new URL("../../prisma/schema.prisma", import.meta.url);
const loginUrl = new URL("../../lib/server/login-handler.ts", import.meta.url);

test("production rate limits use a persistent atomic privacy-preserving bucket", async () => {
  const [helper, schema, login] = await Promise.all([readFile(helperUrl, "utf8"), readFile(schemaUrl, "utf8"), readFile(loginUrl, "utf8")]);
  assert.match(schema, /model RateLimitBucket/);
  assert.match(helper, /digestSensitive/);
  assert.match(helper, /INSERT INTO "RateLimitBucket"/);
  assert.match(helper, /ON CONFLICT \("keyHash"\) DO UPDATE/);
  assert.doesNotMatch(helper, /identity:\s*String\s+@/);
  assert.match(login, /FORMAL_LOGIN_IP/);
  assert.match(login, /FORMAL_LOGIN_ACCOUNT/);
  assert.doesNotMatch(login, /checkRateLimit/);
});
