#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedRoot = path.join(root, "app/generated/prisma");

async function snapshot(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = new Map();

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.join(prefix, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [name, contents] of await snapshot(absolutePath, relativePath)) {
        files.set(name, contents);
      }
    } else {
      files.set(relativePath, await readFile(absolutePath, "utf8"));
    }
  }

  return files;
}

const before = await snapshot(generatedRoot);
execFileSync("npm", ["run", "generate"], { cwd: root, stdio: "inherit" });
const after = await snapshot(generatedRoot);
const changed = [...new Set([...before.keys(), ...after.keys()])].filter(
  (file) => before.get(file) !== after.get(file),
);

if (changed.length > 0) {
  console.error("Prisma generated output is not reproducible:");
  for (const file of changed) console.error(`  - ${file}`);
  process.exit(1);
}

console.log("Prisma generated output is reproducible.");