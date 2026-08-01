import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteFromR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim() || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return Boolean(expected) && left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date();
  const staleUploadCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const unreferencedCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sessionCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const candidates = await prisma.asset.findMany({
    where: {
      day1Slots: { none: {} },
      OR: [
        { createdAt: { lt: staleUploadCutoff }, processingStatus: { in: ["UPLOADING", "FAILED"] } },
        { createdAt: { lt: unreferencedCutoff } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: { id: true, storageKey: true },
  });
  let assetsDeleted = 0;
  let assetRetries = 0;
  for (const asset of candidates) {
    try {
      await deleteFromR2(asset.storageKey);
      const deleted = await prisma.asset.deleteMany({ where: { id: asset.id, day1Slots: { none: {} } } });
      assetsDeleted += deleted.count;
    } catch {
      assetRetries += 1;
    }
  }
  const [idempotency, rateLimits, sessions] = await prisma.$transaction([
    prisma.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: sessionCutoff } },
          { revokedAt: { lt: sessionCutoff } },
        ],
      },
    }),
  ]);
  return NextResponse.json({
    ok: true,
    cleaned: {
      idempotencyRecords: idempotency.count,
      rateLimitBuckets: rateLimits.count,
      sessions: sessions.count,
      assetsDeleted,
      assetRetries,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
