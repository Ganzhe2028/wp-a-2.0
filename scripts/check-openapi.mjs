#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const document = JSON.parse(await readFile(new URL("../docs/openapi.v1.json", import.meta.url), "utf8"));
if (document.openapi !== "3.1.0") throw new Error("OpenAPI version must be 3.1.0");
const requiredPaths = [
  "/auth/methods", "/auth/login", "/auth/logout", "/auth/session", "/auth/oidc/start", "/auth/oidc/callback",
  "/home", "/submissions/{section}", "/submissions/{section}/draft", "/submissions/{section}/submit",
  "/assets/presign", "/assets/{assetId}", "/assets/{assetId}/complete", "/gallery", "/artworks/{publicId}",
  "/admin/login", "/admin/logout", "/admin/session", "/admin/dashboard", "/admin/settings",
  "/admin/settings/apply-preset", "/admin/accounts", "/admin/groups", "/admin/groups/{id}", "/admin/accounts/import", "/admin/accounts/import-emails",
  "/admin/accounts/export-exhibition",
  "/admin/accounts/bulk", "/admin/accounts/{id}", "/admin/accounts/{id}/reset-password", "/admin/audit-logs",
];
const missing = requiredPaths.filter((path) => !document.paths?.[path]);
if (missing.length) throw new Error(`OpenAPI paths missing: ${missing.join(", ")}`);
const operationIds = Object.values(document.paths).flatMap((item) => Object.values(item).map((operation) => operation.operationId).filter(Boolean));
if (new Set(operationIds).size !== operationIds.length) throw new Error("OpenAPI operationId values must be unique");
console.log(`OpenAPI contract valid: ${requiredPaths.length} formal paths`);
