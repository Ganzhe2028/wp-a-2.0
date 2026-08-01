import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const oidcUrl = new URL("../../lib/server/oidc.ts", import.meta.url);
const authModeUrl = new URL("../../lib/server/auth-mode.ts", import.meta.url);
const callbackUrl = new URL("../../app/api/v1/auth/oidc/callback/route.ts", import.meta.url);
const startUrl = new URL("../../app/api/v1/auth/oidc/start/route.ts", import.meta.url);
const schemaUrl = new URL("../../prisma/schema.prisma", import.meta.url);

test("auth mode keeps local-only as the fail-safe default", async () => {
  const source = await readFile(authModeUrl, "utf8");
  assert.match(source, /process\.env\.AUTH_MODE\s*\|\|\s*"LOCAL_ONLY"/);
  assert.match(source, /getAuthMode\(\)\s*!==\s*"OIDC_ONLY"/);
  assert.match(source, /getAuthMode\(\)\s*!==\s*"LOCAL_ONLY"/);
  assert.match(source, /return\s+"LOCAL_ONLY"/);
});

test("OIDC authorization uses signed state, nonce and PKCE", async () => {
  const [oidc, start] = await Promise.all([readFile(oidcUrl, "utf8"), readFile(startUrl, "utf8")]);
  assert.match(oidc, /new SignJWT/);
  assert.match(oidc, /timingSafeEqual/);
  assert.match(oidc, /codeChallenge\s*=\s*createHash\("sha256"\)/);
  assert.match(start, /code_challenge_method",\s*"S256"/);
  assert.match(start, /scope",\s*"openid email profile"/);
});

test("OIDC callback verifies token and binds only a pre-provisioned active user", async () => {
  const [oidc, callback, schema] = await Promise.all([
    readFile(oidcUrl, "utf8"),
    readFile(callbackUrl, "utf8"),
    readFile(schemaUrl, "utf8"),
  ]);
  assert.match(oidc, /createRemoteJWKSet/);
  assert.match(oidc, /requiredClaims:\s*\["iss",\s*"sub",\s*"aud",\s*"exp",\s*"iat",\s*"nonce",\s*"email",\s*"email_verified"\]/);
  assert.match(oidc, /payload\.email_verified\s*!==\s*true/);
  assert.match(oidc, /oidcIdentity\.findUnique/);
  assert.match(oidc, /user\.findUnique\(\{\s*where:\s*\{\s*email:/s);
  assert.match(oidc, /user\.status\s*!==\s*"ACTIVE"/);
  assert.doesNotMatch(oidc, /user\.create\(/);
  assert.match(oidc, /TransactionIsolationLevel\.Serializable/);
  assert.match(callback, /setUnifiedSessionCookie/);
  assert.match(schema, /@@unique\(\[issuer, subject\]\)/);
  assert.match(schema, /@@unique\(\[userId, issuer\]\)/);
});
