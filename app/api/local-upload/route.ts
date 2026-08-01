import { NextRequest, NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { hasTrustedWriteOrigin } from "@/lib/server/request-security";
import { requireFormalViewer } from "@/lib/server/student-request";

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES) || 512 * 1024;
const KEY_PATTERN = /^(?:[A-Za-z0-9_-]+\/){1,3}[A-Za-z0-9_-]+\.(?:jpeg|jpg|png|webp)$/;

function localPath(key: string): string | null {
  const directory = process.env.LOCAL_UPLOAD_DIR;
  if (!directory || !KEY_PATTERN.test(key)) return null;
  return path.join(directory, key);
}

export async function PUT(request: NextRequest) {
  if (!hasTrustedWriteOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const context = await requireFormalViewer(request, { write: true });
  if (!context.ok) return context.response;

  const key = request.nextUrl.searchParams.get("key") ?? "";
  const destination = localPath(key);
  const segments = key.split("/");
  const owned = segments.at(-2) === context.viewer.userId;
  if (!destination || !owned) {
    return NextResponse.json({ error: "Invalid upload key" }, { status: 400 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 415 });
  }

  const bytes = Buffer.from(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Image must be 512 KB or smaller" }, { status: 413 });
  }

  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key") ?? "";
  const source = localPath(key);
  if (!source) return new NextResponse("Not found", { status: 404 });

  try {
    const bytes = await readFile(source);
    const extension = path.extname(key).slice(1);
    const contentType = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
