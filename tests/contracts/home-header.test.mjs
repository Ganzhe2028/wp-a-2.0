import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Home has no circular back link and keeps logout as its session exit", async () => {
  const [header, home] = await Promise.all([
    readFile(new URL("../../components/student/StudentHeader.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/home/HomeClient.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(header, /backHref\?: string \| null/);
  assert.match(header, /\{backHref && <Link/);
  assert.match(header, /backHref \? "" : "col-span-2"/);
  assert.match(home, /<StudentHeader title="HOME" backHref=\{null\} showLogout \/>/);
  assert.doesNotMatch(home, /<StudentHeader title="HOME" backHref="\/home"/);
});
