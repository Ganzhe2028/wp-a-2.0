import { NextRequest, NextResponse } from "next/server";
import { verifyStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_NAME_LENGTH = 40;
const MAX_GRADE_LENGTH = 20;
const MAX_BIO_LENGTH = 80;

function codePointLength(value: string) {
  return [...value].length;
}

function validateOptionalText(
  value: unknown,
  field: string,
  maxLength: number
) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    return `${field} must be a string`;
  }

  const length = codePointLength(value);
  if (length > maxLength) {
    return `${field} must be ≤ ${maxLength} characters (got ${length})`;
  }

  return null;
}

function isValidAvatarUrl(value: string) {
  const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
  return !!base && value.startsWith(`${base}/`) && !value.includes("?");
}

export async function GET() {
  const session = await verifyStudentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const person = await prisma.person.findUnique({
    where: { id: session.personId },
    select: {
      id: true,
      code: true,
      englishName: true,
      chineseName: true,
      grade: true,
      bio: true,
      avatarUrl: true,
      published: true,
      images: { orderBy: { sort: "asc" } },
    },
  });

  return NextResponse.json({ person, images: person?.images ?? [] });
}

export async function PATCH(_request: NextRequest) {
  const session = await verifyStudentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await _request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid request body");
    }
    body = parsed;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { englishName, chineseName, grade, bio, avatarUrl } = body;

  for (const [value, field, maxLength] of [
    [englishName, "englishName", MAX_NAME_LENGTH],
    [chineseName, "chineseName", MAX_NAME_LENGTH],
    [grade, "grade", MAX_GRADE_LENGTH],
    [bio, "bio", MAX_BIO_LENGTH],
  ] as const) {
    const error = validateOptionalText(value, field, maxLength);
    if (error) {
      return NextResponse.json(
        { error },
        { status: 400 }
      );
    }
  }

  const normalizedAvatarUrl = avatarUrl === "" ? null : avatarUrl;
  if (
    normalizedAvatarUrl !== undefined &&
    normalizedAvatarUrl !== null &&
    (typeof normalizedAvatarUrl !== "string" ||
      !isValidAvatarUrl(normalizedAvatarUrl))
  ) {
    return NextResponse.json(
      { error: "avatarUrl must be an R2 public URL or null" },
      { status: 400 }
    );
  }

  const person = await prisma.person.findUnique({
    where: { id: session.personId },
    select: { avatarUrl: true },
  });
  const effectiveAvatarUrl =
    normalizedAvatarUrl !== undefined ? normalizedAvatarUrl : person?.avatarUrl;
  const published = !!effectiveAvatarUrl;

  const updated = await prisma.person.update({
    where: { id: session.personId },
    select: {
      id: true,
      code: true,
      englishName: true,
      chineseName: true,
      grade: true,
      bio: true,
      avatarUrl: true,
      published: true,
      images: { orderBy: { sort: "asc" } },
    },
    data: {
      ...(englishName !== undefined && { englishName }),
      ...(chineseName !== undefined && { chineseName }),
      ...(grade !== undefined && { grade }),
      ...(bio !== undefined && { bio }),
      ...(normalizedAvatarUrl !== undefined && {
        avatarUrl: normalizedAvatarUrl,
      }),
      published,
    },
  });

  return NextResponse.json({ ok: true, person: updated });
}
