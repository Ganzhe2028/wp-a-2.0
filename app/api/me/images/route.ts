import { NextRequest, NextResponse } from "next/server";
import { verifyStudentSession } from "@/lib/auth";
import { deleteFromR2, getKeyFromPublicUrl, getPublicUrl } from "@/lib/r2";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";

const MAX_SAVE_ATTEMPTS = 3;

class ImageLimitError extends Error {}

export async function POST(request: NextRequest) {
  const session = await verifyStudentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
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

  const { url, key } = body;
  if (!url || !key) {
    return NextResponse.json(
      { error: "url and key required" },
      { status: 400 }
    );
  }

  if (typeof url !== "string" || typeof key !== "string") {
    return NextResponse.json(
      { error: "url and key must be strings" },
      { status: 400 }
    );
  }

  if (!key.startsWith(`${session.personId}/`) || url !== getPublicUrl(key)) {
    return NextResponse.json(
      { error: "Invalid image key or URL" },
      { status: 400 }
    );
  }

  for (let attempt = 1; attempt <= MAX_SAVE_ATTEMPTS; attempt++) {
    try {
      const image = await prisma.$transaction(
        async (tx) => {
          const imageCount = await tx.image.count({
            where: { personId: session.personId, hidden: false },
          });

          if (imageCount >= 4) {
            throw new ImageLimitError();
          }

          const maxSort = await tx.image.aggregate({
            where: { personId: session.personId },
            _max: { sort: true },
          });

          return tx.image.create({
            data: {
              personId: session.personId,
              url,
              key,
              sort: (maxSort._max.sort ?? -1) + 1,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      return NextResponse.json({ image });
    } catch (error) {
      if (error instanceof ImageLimitError) {
        return NextResponse.json(
          { error: "Maximum 4 images allowed" },
          { status: 409 }
        );
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        if (attempt < MAX_SAVE_ATTEMPTS) continue;
        break;
      }

      throw error;
    }
  }

  return NextResponse.json(
    { error: "Could not save image after retrying" },
    { status: 503 }
  );
}

export async function DELETE(request: NextRequest) {
  const session = await verifyStudentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "id required" },
      { status: 400 }
    );
  }

  const image = await prisma.image.findUnique({ where: { id } });
  if (!image || image.personId !== session.personId) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const r2Key = image.key.includes("/")
    ? image.key
    : getKeyFromPublicUrl(image.url) ?? image.key;
  await deleteFromR2(r2Key);
  await prisma.image.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
