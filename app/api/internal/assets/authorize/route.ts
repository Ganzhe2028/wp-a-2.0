import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canViewerAccessArtworkOwner } from "@/lib/domain/gallery-access";
import { verifyAssetProcessorRequest, readBoundedBody } from "@/lib/server/asset-processor-auth";
import { getFormalSession } from "@/lib/server/formal-session";

function originalProcessedKey(requestedKey: string): string | null {
  if (requestedKey.startsWith("processed/")) return requestedKey;
  if (requestedKey.startsWith("_derived/processed/") && requestedKey.endsWith(".thumb.webp")) {
    return requestedKey.slice("_derived/".length, -".thumb.webp".length);
  }
  return null;
}

export async function POST(request: Request) {
  const rawBody = await readBoundedBody(request);
  if (rawBody === null) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413, headers: { "Cache-Control": "no-store" } });
  }
  if (!verifyAssetProcessorRequest(request, rawBody)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  let requestedKey = "";
  try {
    const body: unknown = JSON.parse(rawBody);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid");
    requestedKey = typeof (body as Record<string, unknown>).storageKey === "string"
      ? (body as Record<string, unknown>).storageKey as string
      : "";
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const storageKey = originalProcessedKey(requestedKey);
  const viewer = await getFormalSession();
  if (!storageKey || !viewer) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const asset = await prisma.asset.findFirst({
    where: {
      storageKey,
      eventId: viewer.eventId,
      scanStatus: "PASSED",
      processingStatus: "READY",
    },
    select: {
      ownerUserId: true,
      owner: {
        select: {
          id: true,
          role: true,
          groupId: true,
          status: true,
          artworkPublicIds: {
            where: { eventId: viewer.eventId, revokedAt: null },
            select: { id: true },
            take: 1,
          },
        },
      },
      day1Slots: {
        select: { submission: { select: { section: true, status: true } } },
      },
    },
  });
  if (!asset || asset.owner.status !== "ACTIVE") {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  if (viewer.role === "ADMIN" || viewer.userId === asset.ownerUserId) {
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }

  const ownerSubmitted = asset.day1Slots.some(
    (slot) => slot.submission.section === "DAY1" && slot.submission.status === "SUBMITTED",
  );
  if (!ownerSubmitted || asset.owner.artworkPublicIds.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const [settings, viewerSubmission] = await Promise.all([
    prisma.eventSettings.findUnique({ where: { eventId: viewer.eventId } }),
    prisma.submission.findUnique({
      where: {
        eventId_userId_section: {
          eventId: viewer.eventId,
          userId: viewer.userId,
          section: "DAY1",
        },
      },
      select: { status: true },
    }),
  ]);
  if (
    !settings?.fullProfileVisible ||
    viewerSubmission?.status !== "SUBMITTED" ||
    !canViewerAccessArtworkOwner(
      viewer,
      { userId: asset.owner.id, role: asset.owner.role, groupId: asset.owner.groupId },
      settings,
    )
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
