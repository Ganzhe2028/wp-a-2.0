import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const day1Url = new URL("../../app/me/day-1/Day1Client.tsx", import.meta.url);
const day3Url = new URL("../../app/me/day-3/Day3Client.tsx", import.meta.url);
const homeUrl = new URL("../../app/api/v1/home/route.ts", import.meta.url);

test("submitted editors require confirmation before reopening as draft", async () => {
  for (const url of [day1Url, day3Url]) {
    const source = await readFile(url, "utf8");
    assert.match(source, /next\.status === "SUBMITTED"/);
    assert.match(source, /window\.confirm\(/);
    assert.match(source, /\/draft/);
    assert.match(source, /status:\s*"DRAFT"/);
  }
});

test("existing drafts remain enterable when authoring is closed", async () => {
  const source = await readFile(homeUrl, "utf8");
  assert.match(source, /canEnter:\s*status !== "NOT_STARTED" \|\| sectionOpen/);
});
