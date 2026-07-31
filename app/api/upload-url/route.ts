import { NextRequest, NextResponse } from "next/server";
import { verifyStudentSession } from "@/lib/auth";
import { createPresignedUploadUrl, getPublicUrl } from "@/lib/r2";
import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";
import { checkRateLimit } from "@/lib/rate-limit";

const UPLOAD_WINDOW_MS = 10 * 60 * 1000;
const MAX_UPLOAD_URLS_PER_USER = 20;

export async function POST(request: NextRequest) {
  const session = await verifyStudentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    !checkRateLimit(
      `upload-url:user:${session.personId}`,
      MAX_UPLOAD_URLS_PER_USER,
      UPLOAD_WINDOW_MS
    )
  ) {
    return NextResponse.json(
      { error: "Too many upload attempts. Please try again later." },
      { status: 429 }
    );
  }

  let contentType: string;
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Invalid request body");
    }
    contentType = body.contentType;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  if (!contentType || typeof contentType !== "string") {
    return NextResponse.json(
      { error: "contentType required" },
      { status: 400 }
    );
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(contentType)) {
    return NextResponse.json(
      { error: "Only jpg, png, webp allowed" },
      { status: 400 }
    );
  }

  const imageCount = await prisma.image.count({
    where: { personId: session.personId, hidden: false },
  });

  if (imageCount >= 4) {
    return NextResponse.json(
      { error: "Maximum 4 images allowed" },
      { status: 409 }
    );
  }

  const ext = contentType.split("/")[1] || "webp";
  const key = `${session.personId}/${nanoid()}.${ext}`;

  const putUrl = await createPresignedUploadUrl(key, contentType);
  const publicUrl = getPublicUrl(key);

  return NextResponse.json({ putUrl, publicUrl, key });
}
