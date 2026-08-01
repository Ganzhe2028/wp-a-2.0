#!/usr/bin/env node

import "dotenv/config";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaNeon } from "@prisma/adapter-neon";
// @ts-expect-error Node's strip-types runner requires the source extension at runtime.
import { Prisma, PrismaClient } from "../app/generated/prisma/client.ts";

interface MappingRow {
  legacyPersonId: string;
  accountCode: string;
}

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function csvLine(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { cells.push(value.trim()); value = ""; }
    else value += char;
  }
  cells.push(value.trim());
  return cells;
}

function parseMapping(contents: string): MappingRow[] {
  const records = contents.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(csvLine);
  if (records[0]?.[0]?.toLowerCase() === "legacypersonid") records.shift();
  return records.map((cells) => ({ legacyPersonId: cells[0] || "", accountCode: cells[1] || "" }));
}

function fail(message: string): never {
  throw new Error(message);
}

const mappingPath = option("mapping");
const eventKey = option("event-key") || process.env.OWEEK_EVENT_KEY || process.env.DEFAULT_EVENT_KEY || "oweek-2026";
const actorAccountCode = option("actor-account-code") || "SophiaXu";
const apply = process.argv.includes("--apply");
const rollback = process.argv.includes("--rollback");
if (!mappingPath || (apply && rollback)) {
  console.error("Usage: npm run migrate:legacy -- --mapping=/absolute/mapping.csv [--event-key=oweek-2026] [--actor-account-code=SophiaXu] [--apply|--rollback]");
  process.exit(2);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) fail("DATABASE_URL is required (use DOTENV_CONFIG_PATH=.env.local locally)");
const sessionSecret = process.env.SESSION_SECRET?.trim();
if (!sessionSecret) fail("SESSION_SECRET is required for privacy-preserving audit targets");

const mappingContents = await readFile(mappingPath, "utf8");
const rows = parseMapping(mappingContents);
if (!rows.length || rows.length > 5_000 || rows.some((row) => !row.legacyPersonId || !row.accountCode)) fail("Mapping CSV is empty or invalid");
if (new Set(rows.map((row) => row.legacyPersonId)).size !== rows.length) fail("Mapping CSV contains duplicate legacyPersonId values");
if (new Set(rows.map((row) => row.accountCode)).size !== rows.length) fail("Mapping CSV contains duplicate accountCode values");

const mappingDigest = createHash("sha256").update(mappingContents).digest("hex");
const adapter = new PrismaNeon({ connectionString: databaseUrl });
const client = new PrismaClient({ adapter });

try {
  const preview = await client.$transaction(async (tx) => {
    const event = await tx.event.findUnique({ where: { eventKey }, select: { id: true, eventKey: true } });
    if (!event) fail(`Formal event not found: ${eventKey}`);
    const actor = await tx.user.findUnique({ where: { accountCode: actorAccountCode }, select: { id: true, eventId: true, role: true, status: true } });
    if (!actor || actor.eventId !== event.id || actor.role !== "ADMIN" || actor.status !== "ACTIVE") fail("Migration actor must be an ACTIVE Admin in the target event");
    const [persons, users, existingLinks] = await Promise.all([
      tx.person.findMany({
        where: { id: { in: rows.map((row) => row.legacyPersonId) } },
        select: { id: true, images: { select: { id: true } }, day1SubmittedAt: true, day3SubmittedAt: true, avatarUrl: true, bio: true },
      }),
      tx.user.findMany({
        where: { eventId: event.id, accountCode: { in: rows.map((row) => row.accountCode) } },
        select: { id: true, accountCode: true },
      }),
      tx.legacyPersonLink.findMany({
        where: { OR: [{ legacyPersonId: { in: rows.map((row) => row.legacyPersonId) } }, { user: { accountCode: { in: rows.map((row) => row.accountCode) } } }] },
        select: { id: true, legacyPersonId: true, userId: true, user: { select: { accountCode: true } } },
      }),
    ]);
    const personIds = new Set(persons.map((person) => person.id));
    const usersByCode = new Map(users.map((user) => [user.accountCode, user]));
    const conflicts: string[] = [];
    for (const row of rows) {
      if (!personIds.has(row.legacyPersonId)) conflicts.push(`missing Person ${row.legacyPersonId}`);
      const user = usersByCode.get(row.accountCode);
      if (!user) conflicts.push(`missing User accountCode ${row.accountCode}`);
      const existing = existingLinks.find((link) => link.legacyPersonId === row.legacyPersonId || link.user.accountCode === row.accountCode);
      if (existing && (existing.legacyPersonId !== row.legacyPersonId || existing.user.accountCode !== row.accountCode)) {
        conflicts.push(`conflicting existing link for ${row.legacyPersonId} / ${row.accountCode}`);
      }
    }
    if (conflicts.length) fail(`Mapping conflicts:\n${conflicts.join("\n")}`);
    const alreadyLinked = rows.filter((row) => existingLinks.some((link) => link.legacyPersonId === row.legacyPersonId && link.user.accountCode === row.accountCode)).length;
    const legacyContentCount = persons.filter((person) => person.images.length || person.day1SubmittedAt || person.day3SubmittedAt || person.avatarUrl || person.bio).length;
    return { event, actor, usersByCode, existingLinks, alreadyLinked, legacyContentCount };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  console.log(JSON.stringify({
    mode: rollback ? "ROLLBACK_PREVIEW" : apply ? "APPLY" : "DRY_RUN",
    eventKey: preview.event.eventKey,
    mappingRows: rows.length,
    alreadyLinked: preview.alreadyLinked,
    wouldCreate: rows.length - preview.alreadyLinked,
    legacyRecordsWithContentPreservedInPerson: preview.legacyContentCount,
    mappingDigest,
  }, null, 2));

  if (!apply && !rollback) {
    console.log("Dry run only. Re-run with --apply to create explicit links. Legacy content remains untouched until approved slot/bottle transformation rules exist.");
    process.exit(0);
  }

  const requestId = `req_${randomBytes(12).toString("hex")}`;
  const digestTarget = (value: string) => createHmac("sha256", sessionSecret).update(value).digest("hex");
  const result = await client.$transaction(async (tx) => {
    let changed = 0;
    for (const row of rows) {
      const user = preview.usersByCode.get(row.accountCode)!;
      const existing = await tx.legacyPersonLink.findUnique({ where: { legacyPersonId: row.legacyPersonId } });
      if (rollback) {
        if (!existing || existing.userId !== user.id) continue;
        await tx.legacyPersonLink.delete({ where: { id: existing.id } });
      } else {
        if (existing) continue;
        await tx.legacyPersonLink.create({
          data: { eventId: preview.event.id, legacyPersonId: row.legacyPersonId, userId: user.id, mappingDigest },
        });
      }
      await tx.adminAuditLog.create({
        data: {
          eventId: preview.event.id,
          actorUserId: preview.actor.id,
          action: rollback ? "LEGACY_PERSON_LINK_ROLLED_BACK" : "LEGACY_PERSON_LINK_CREATED",
          targetType: "USER",
          targetId: digestTarget(user.id),
          summary: rollback ? "Explicit legacy Person link rolled back" : "Explicit legacy Person link created",
          requestId,
          after: { linked: !rollback, mappingDigest },
        },
      });
      changed += 1;
    }
    return changed;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  console.log(JSON.stringify({ completed: true, operation: rollback ? "ROLLBACK" : "APPLY", changed: result, requestId }, null, 2));
} finally {
  await client.$disconnect();
}
