import assert from "node:assert/strict";
import test from "node:test";
import { hasTrustedWriteOrigin } from "../../lib/server/request-security.ts";

test("write origin validation accepts every same-origin project domain without trusting unrelated sites", () => {
  const previousBaseUrl = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = "https://www.msoweek.site";

  try {
    assert.equal(hasTrustedWriteOrigin(new Request("https://www.msoweek.site/api/v1/auth/login", {
      headers: { Origin: "https://www.msoweek.site" },
    })), true);
    assert.equal(hasTrustedWriteOrigin(new Request("https://oweek-wp-a-2.vercel.app/api/v1/auth/login", {
      headers: { Origin: "https://oweek-wp-a-2.vercel.app" },
    })), true);
    assert.equal(hasTrustedWriteOrigin(new Request("https://oweek-wp-a-2.vercel.app/api/v1/auth/login", {
      headers: { Origin: "https://www.msoweek.site" },
    })), true);
    assert.equal(hasTrustedWriteOrigin(new Request("https://www.msoweek.site/api/v1/auth/login", {
      headers: { Origin: "https://attacker.example" },
    })), false);
  } finally {
    if (previousBaseUrl === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = previousBaseUrl;
  }
});
