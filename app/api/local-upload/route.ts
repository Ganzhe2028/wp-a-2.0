import { NextRequest, NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { hasTrustedWriteOrigin } from "@/lib/server/request-security";
import { requireFormalViewer } from "@/lib/server/student-request";
import { consumePersistentRateLimit } from "@/lib/server/persistent-rate-limit";
import { prisma } from "@/lib/prisma";

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES) || 512 * 1024;
const MAX_TOTAL_ASSETS = 2_250;
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

  // 与 presign 流程对齐：持久限流 + 全局资产上限（本地模式上传路径同样受控）
  let rateLimit;
  try {
    rateLimit = await consumePersistentRateLimit({ scope: "LOCAL_UPLOAD", identity: context.viewer.userId, limit: 100, windowMs: 15 * 60 * 1000 });
  } catch {
    return NextResponse.json({ error: "Upload service unavailable" }, { status: 500 });
  }
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Upload rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  }
  const totalAssets = await prisma.asset.count();
  if (totalAssets >= MAX_TOTAL_ASSETS) {
    return NextResponse.json({ error: "Global asset limit reached" }, { status: 403 });
  }

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
  const context = await requireFormalViewer(request);
  if (!context.ok) return context.response;

  const key = request.nextUrl.searchParams.get("key") ?? "";
  const source = localPath(key);
  const segments = key.split("/");
  const owned = segments.at(-2) === context.viewer.userId;
  if (!source || !owned) return new NextResponse("Not found", { status: 404 });

  try {
    const bytes = await readFile(source);
    const extension = path.extname(key).slice(1);
    const contentType = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
