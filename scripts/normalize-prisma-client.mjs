#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedRoot = path.join(root, "app/generated/prisma");
const generatedFiles = [
  "browser.ts",
  "client.ts",
  "commonInputTypes.ts",
  "enums.ts",
  "internal/class.ts",
  "internal/prismaNamespace.ts",
  "internal/prismaNamespaceBrowser.ts",
  "models.ts",
  "models/AdminAuditLog.ts",
  "models/ArtworkPublicId.ts",
  "models/Asset.ts",
  "models/Day1Slot.ts",
  "models/Day3Bottle.ts",
  "models/Event.ts",
  "models/EventAnonymousId.ts",
  "models/EventSettings.ts",
  "models/Group.ts",
  "models/LegacyPersonLink.ts",
  "models/RateLimitBucket.ts",
  "models/Submission.ts",
  "models/User.ts",
];

for (const relativePath of generatedFiles) {
  const generatedFile = path.join(generatedRoot, relativePath);
  const contents = await readFile(generatedFile, "utf8");
  const normalized = contents
    .replaceAll(root, "/workspace")
    .replace(/[\t ]+$/gm, "");

  if (normalized !== contents) {
    await writeFile(generatedFile, normalized);
  }
}
