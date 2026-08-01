import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cursorUrl = new URL("../../lib/server/gallery-cursor.ts", import.meta.url);
const routeUrl = new URL("../../app/api/v1/gallery/route.ts", import.meta.url);

test("gallery cursor is signed, seek-based, and bound to visibility and query context", async () => {
  const [cursor, route] = await Promise.all([readFile(cursorUrl, "utf8"), readFile(routeUrl, "utf8")]);
  assert.match(cursor, /timingSafeEqual/);
  assert.match(cursor, /after:\s*string \| null/);
  assert.match(cursor, /queryHash/);
  assert.match(cursor, /onlyWithContent/);
  assert.match(cursor, /accessScopeHash/);
  assert.match(cursor, /settingsVersion/);
  assert.match(cursor, /showName/);
  assert.doesNotMatch(cursor, /offset:/);
  assert.match(route, /findIndex\(\(user\) => sortKey\(user\)/);
  assert.doesNotMatch(route, /users\.slice\(offset/);
});

test("every active account has a gallery page and filled-only is optional", async () => {
  const [contract, route, artworkRoute, client, artworkClient] = await Promise.all([
    readFile(new URL("../../lib/contracts/gallery.ts", import.meta.url), "utf8"),
    readFile(routeUrl, "utf8"),
    readFile(new URL("../../app/api/v1/artworks/[publicId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/browse/BrowseClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/artworks/[publicId]/ArtworkClient.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(contract, /Submission state controls page content, never whether the page exists/);
  assert.match(route, /onlyWithContent && \{ submissions: \{ some: \{ section, status: "SUBMITTED" \} \} \}/);
  assert.match(route, /sectionStates: \{ \[section\]: hasContent \? "AVAILABLE" : "NO_CONTENT" \}/);
  assert.match(client, /只显示已填写内容的人/);
  assert.match(client, /params\.set\("filled", "true"\)/);
  assert.match(artworkRoute, /_count: \{ select: \{ submissions: \{ where: \{ status: "SUBMITTED" \} \} \} \}/);
  assert.match(artworkRoute, /identityOnlyReason: hasAnyContent \? "EVENT_IDENTITY_ONLY" : "NO_CONTENT"/);
  assert.match(artworkClient, /identityOnlyReason === "NO_CONTENT"/);
});
