#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FAIL = [];
const WARN = [];
const PASS = [];

const VALID_STATUSES = new Set(["open", "fixed", "deferred", "false_positive"]);
const BLOCKING_SEVERITIES = new Set(["P0", "P1"]);

function rel(file) {
  return path.relative(ROOT, file).replaceAll(path.sep, "/");
}

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

function addPass(message) {
  PASS.push(message);
}

function addWarn(message) {
  WARN.push(message);
}

function addFail(message) {
  FAIL.push(message);
}

function listFiles(startRel, options = {}) {
  const start = path.join(ROOT, startRel);
  if (!existsSync(start)) return [];
  const files = [];
  const ignoredDirs = new Set([
    ".git",
    ".next",
    "node_modules",
    "app/generated",
    ...(options.ignoredDirs ?? []),
  ]);
  const extensions = options.extensions ?? null;

  function walk(dir) {
    const dirRel = rel(dir);
    if (ignoredDirs.has(dirRel) || ignoredDirs.has(path.basename(dir))) return;
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        walk(full);
      } else if (!extensions || extensions.has(path.extname(entry))) {
        files.push(full);
      }
    }
  }

  const stats = statSync(start);
  if (stats.isDirectory()) walk(start);
  else files.push(start);
  return files;
}

function sourceFiles() {
  const exts = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx", ".prisma"]);
  return [
    ...listFiles("app", { extensions: exts }),
    ...listFiles("components", { extensions: exts }),
    ...listFiles("lib", { extensions: exts }),
    ...listFiles("prisma", { extensions: exts }),
    ...["next.config.ts", "prisma.config.ts"].flatMap((file) =>
      existsSync(path.join(ROOT, file)) ? [path.join(ROOT, file)] : []
    ),
  ];
}

function docFiles() {
  const files = [];
  for (const file of ["README.md", "AGENTS.md"]) {
    const full = path.join(ROOT, file);
    if (existsSync(full)) files.push(full);
  }
  files.push(...listFiles("docs", { extensions: new Set([".md", ".json"]) }));
  return files;
}

function findInFiles(files, pattern) {
  const matches = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        matches.push(`${rel(file)}:${index + 1}: ${line.trim()}`);
      }
    });
  }
  return matches;
}

function checkPackageBuild() {
  const pkg = JSON.parse(read("package.json"));
  const build = pkg.scripts?.build ?? "";
  const generate = pkg.scripts?.generate ?? "";
  if (/\bprisma\s+generate\b/.test(build) || (/npm\s+run\s+generate/.test(build) && /\bprisma\s+generate\b/.test(generate))) {
    addPass("package.json build includes prisma generate");
  } else {
    addFail("package.json scripts.build must include `prisma generate` before Next build");
  }
}

function checkV11Baseline() {
  const requiredFiles = [
    ".github/workflows/ci.yml",
    ".nvmrc",
    "docs/08_v1.1_工程基线与契约.md",
    "lib/contracts/errors.ts",
    "lib/contracts/request-id.ts",
    "lib/contracts/response.ts",
    "tests/contracts/contracts.test.mjs",
  ];
  const missing = requiredFiles.filter((file) => !existsSync(path.join(ROOT, file)));
  if (missing.length) {
    addFail(`v1.1 baseline files are missing: ${missing.join(", ")}`);
    return;
  }

  const pkg = JSON.parse(read("package.json"));
  const requiredScripts = ["lint", "typecheck", "test", "build", "audit:harness", "verify:ci"];
  const missingScripts = requiredScripts.filter((script) => !pkg.scripts?.[script]);
  if (missingScripts.length) {
    addFail(`v1.1 CI scripts are missing: ${missingScripts.join(", ")}`);
    return;
  }

  if (pkg.engines?.node !== "22.14.0" || pkg.engines?.npm !== "10.9.2") {
    addFail("Node and npm versions must remain pinned to 22.14.0 and 10.9.2");
    return;
  }

  addPass("v1.1 docs, contracts, toolchain, tests, and CI baseline are present");
}

function checkOldVercelEngineDocs() {
  const matches = findInFiles(
    docFiles(),
    /PRISMA_QUERY_ENGINE_LIBRARY.*(需设|推荐|可选但推荐|must\s+set|required|recommended)/i
  );
  if (matches.length) {
    addFail(
      "Docs still recommend PRISMA_QUERY_ENGINE_LIBRARY:\n" +
        matches.map((m) => `  - ${m}`).join("\n")
    );
  } else {
    addPass("docs do not recommend PRISMA_QUERY_ENGINE_LIBRARY");
  }
}

function checkJwtFallback() {
  const matches = findInFiles(sourceFiles(), /change-me-in-production/);
  if (matches.length) {
    addFail(
      "Source contains JWT fallback `change-me-in-production`:\n" +
        matches.map((m) => `  - ${m}`).join("\n")
    );
  } else {
    addPass("source has no change-me-in-production fallback");
  }
}

function checkR2KeyDerivation() {
  const matches = findInFiles(sourceFiles(), /publicUrl\.split\(["']\/["']\)\.pop\(\)/);
  if (matches.length) {
    addFail(
      "Image persistence derives R2 key from publicUrl instead of returned key:\n" +
        matches.map((m) => `  - ${m}`).join("\n")
    );
  } else {
    addPass("image persistence does not derive R2 key from publicUrl");
  }
}

function checkLegacyRuntimeRetirement() {
  const retiredFiles = [
    "app/api/admin/persons/route.ts",
    "app/api/auth/login/route.ts",
    "app/api/me/route.ts",
    "app/api/upload-url/route.ts",
    "scripts/migrate-legacy-persons.ts",
  ];
  const remaining = retiredFiles.filter((file) => existsSync(path.join(ROOT, file)));
  if (remaining.length) {
    addFail(`Legacy runtime files must remain retired: ${remaining.join(", ")}`);
  } else {
    addPass("legacy Person runtime and migration tooling are retired");
  }
}

function checkOpenRedirect() {
  const files = listFiles("app", { extensions: new Set([".js", ".jsx", ".ts", ".tsx"]) });
  const matches = findInFiles(files, /new URL\(\s*next\s*,/);
  if (matches.length) {
    addFail(
      "`next` redirect validation still uses new URL(next, ...), which can allow external URLs:\n" +
        matches.map((m) => `  - ${m}`).join("\n")
    );
  } else {
    addPass("next redirect validation does not use new URL(next, ...)");
  }
}

function checkFindingsLedger() {
  const file = "docs/review-findings.json";
  if (!existsSync(path.join(ROOT, file))) {
    addFail(`${file} is missing`);
    return;
  }

  let findings;
  try {
    findings = JSON.parse(read(file));
  } catch (error) {
    addFail(`${file} is invalid JSON: ${error.message}`);
    return;
  }

  if (!Array.isArray(findings)) {
    addFail(`${file} must be a JSON array`);
    return;
  }

  const seen = new Set();
  const blockingOpen = [];
  findings.forEach((finding, index) => {
    const label = finding.id ?? `entry ${index}`;
    if (!finding.id || seen.has(finding.id)) {
      addFail(`${file}: finding ids must be present and unique (${label})`);
    }
    seen.add(finding.id);

    if (!VALID_STATUSES.has(finding.status)) {
      addFail(`${file}: ${label} has invalid status \`${finding.status}\``);
    }

    if (!finding.title || !finding.severity || !finding.source || !finding.expectedFix) {
      addFail(`${file}: ${label} is missing required metadata`);
    }

    if (finding.status === "deferred" && !finding.verification) {
      addFail(`${file}: ${label} is deferred without a reason in verification`);
    }

    if (finding.status === "open" && BLOCKING_SEVERITIES.has(finding.severity)) {
      blockingOpen.push(`${finding.id} (${finding.severity}): ${finding.title}`);
    }
  });

  if (blockingOpen.length) {
    addFail(
      "P0/P1 findings remain open:\n" +
        blockingOpen.map((m) => `  - ${m}`).join("\n")
    );
  } else {
    addPass("no open P0/P1 findings in review ledger");
  }
}

function checkDocsSyncWarning() {
  let changed = [];
  try {
    const output = execFileSync("git", ["diff", "--name-only", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    changed = output.split(/\r?\n/).filter(Boolean);
  } catch {
    addWarn("could not inspect git diff for docs sync warning");
    return;
  }

  const sourceChanged = changed.some((file) =>
    /^(app|components|lib|prisma)\//.test(file)
  );
  const docsChanged = changed.some((file) =>
    /^(docs\/|README\.md$|AGENTS\.md$)/.test(file)
  );

  if (sourceChanged && !docsChanged) {
    addWarn("source files changed without README/docs/AGENTS changes");
  } else {
    addPass("docs sync check has no warning");
  }
}

checkPackageBuild();
checkV11Baseline();
checkOldVercelEngineDocs();
checkJwtFallback();
checkR2KeyDerivation();
checkLegacyRuntimeRetirement();
checkOpenRedirect();
checkFindingsLedger();
checkDocsSyncWarning();

for (const message of PASS) console.log(`PASS ${message}`);
for (const message of WARN) console.warn(`WARN ${message}`);
for (const message of FAIL) console.error(`FAIL ${message}`);

if (FAIL.length) {
  console.error(`\nHarness audit failed: ${FAIL.length} failure(s), ${WARN.length} warning(s).`);
  process.exit(1);
}

console.log(`\nHarness audit passed: ${PASS.length} pass(es), ${WARN.length} warning(s).`);
