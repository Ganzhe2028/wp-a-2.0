import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { verifyAdminSession } from "@/lib/auth";
import {
  newCodeCandidate,
  newEditTokenCandidate,
  newPlainPassword,
} from "@/lib/code";
import { hashPassword } from "@/lib/auth";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

interface ImportRow {
  englishName?: string;
  chineseName: string;
  grade?: string;
  username?: string;
}

interface NormalizedImportRow {
  englishName: string | null;
  chineseName: string;
  grade: string | null;
  username: string | null;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeRows(rows: ImportRow[]): NormalizedImportRow[] {
  return rows
    .map((row) => ({
      englishName: textOrNull(row.englishName),
      chineseName: textOrNull(row.chineseName) ?? "",
      grade: textOrNull(row.grade),
      username: textOrNull(row.username),
    }))
    .filter((row) => row.chineseName);
}

function findDuplicate(values: string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

async function createUniqueCodes(count: number): Promise<string[]> {
  const selected = new Set<string>();

  for (let attempt = 0; attempt < 10 && selected.size < count; attempt++) {
    const candidates = new Set<string>();
    while (candidates.size < (count - selected.size) * 2) {
      const code = newCodeCandidate();
      if (!selected.has(code)) candidates.add(code);
    }

    const candidateList = [...candidates];
    const [people, locations] = await Promise.all([
      prisma.person.findMany({
        where: { code: { in: candidateList } },
        select: { code: true },
      }),
      prisma.locationCard.findMany({
        where: { code: { in: candidateList } },
        select: { code: true },
      }),
    ]);
    const existing = new Set([
      ...people.map((person) => person.code),
      ...locations.map((location) => location.code),
    ]);

    for (const code of candidateList) {
      if (selected.size >= count) break;
      if (!existing.has(code)) selected.add(code);
    }
  }

  if (selected.size < count) {
    throw new Error("Failed to generate enough unique codes");
  }

  return [...selected];
}

async function createUniqueEditTokens(count: number): Promise<string[]> {
  const selected = new Set<string>();

  for (let attempt = 0; attempt < 10 && selected.size < count; attempt++) {
    const candidates = new Set<string>();
    while (candidates.size < (count - selected.size) * 2) {
      const token = newEditTokenCandidate();
      if (!selected.has(token)) candidates.add(token);
    }

    const candidateList = [...candidates];
    const people = await prisma.person.findMany({
      where: { editToken: { in: candidateList } },
      select: { editToken: true },
    });
    const existing = new Set(people.map((person) => person.editToken));

    for (const token of candidateList) {
      if (selected.size >= count) break;
      if (!existing.has(token)) selected.add(token);
    }
  }

  if (selected.size < count) {
    throw new Error("Failed to generate enough unique edit tokens");
  }

  return [...selected];
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function importFailureResponse(error: unknown) {
  console.error("[admin/import] failed", error);

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(", ")
        : "唯一字段";
      return jsonError(`导入失败：${target} 已存在，请检查名单是否重复。`, 409);
    }
  }

  return jsonError("导入失败：服务器写入失败，请稍后重试。", 500);
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { rows } = (await request.json()) as { rows: ImportRow[] };
    if (!Array.isArray(rows) || rows.length === 0) {
      return jsonError("rows array required", 400);
    }

    const normalizedRows = normalizeRows(rows);
    if (normalizedRows.length === 0) {
      return jsonError("没有有效学生：每行至少需要中文名。", 400);
    }

    const explicitUsernames = normalizedRows
      .map((row) => row.username)
      .filter((username): username is string => Boolean(username));
    const duplicateExplicitUsername = findDuplicate(explicitUsernames);
    if (duplicateExplicitUsername) {
      return jsonError(`导入失败：用户名 ${duplicateExplicitUsername} 在本次名单中重复。`, 409);
    }

    const [codes, editTokens] = await Promise.all([
      createUniqueCodes(normalizedRows.length),
      createUniqueEditTokens(normalizedRows.length),
    ]);

    const now = new Date();
    const accounts = normalizedRows.map((row, index) => {
      const code = codes[index];
      const username = row.username ?? code;
      const password = newPlainPassword();

      return {
        id: randomUUID(),
        code,
        editToken: editTokens[index],
        username,
        password,
        passwordHash: hashPassword(password),
        englishName: row.englishName,
        chineseName: row.chineseName,
        grade: row.grade,
      };
    });

    const duplicateUsername = findDuplicate(accounts.map((account) => account.username));
    if (duplicateUsername) {
      return jsonError(`导入失败：用户名 ${duplicateUsername} 在本次名单中重复。`, 409);
    }

    const existingUsernames = await prisma.person.findMany({
      where: { username: { in: accounts.map((account) => account.username) } },
      select: { username: true },
    });
    if (existingUsernames.length > 0) {
      return jsonError(
        `导入失败：用户名 ${existingUsernames[0].username} 已存在。`,
        409
      );
    }

    await prisma.$transaction([
      prisma.person.createMany({
        data: accounts.map((account) => ({
          id: account.id,
          code: account.code,
          editToken: account.editToken,
          username: account.username,
          passwordHash: account.passwordHash,
          englishName: account.englishName,
          chineseName: account.chineseName,
          grade: account.grade,
          updatedAt: now,
        })),
      }),
      prisma.locationCard.createMany({
        data: accounts.map((account) => ({
          id: randomUUID(),
          code: account.code,
          personId: account.id,
          name: account.chineseName,
          grade: account.grade,
          room: "",
          seat: "",
          updatedAt: now,
        })),
      }),
    ]);

    const created = accounts.map((account) => ({
      chineseName: account.chineseName,
      code: account.code,
      username: account.username,
      password: account.password,
    }));

    return NextResponse.json({ created });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return jsonError("请求格式错误：无法解析 JSON。", 400);
    }
    return importFailureResponse(error);
  }
}
