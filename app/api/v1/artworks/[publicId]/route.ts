import { NextResponse } from "next/server";
import { failure, success } from "@/lib/contracts";
import { prisma } from "@/lib/prisma";
import { requireFormalViewer } from "@/lib/server/student-request";
import { getThumbnailUrl } from "@/lib/r2";
import { clientRateLimitIdentity, consumePersistentRateLimit } from "@/lib/server/persistent-rate-limit";
import { canViewerAccessArtworkOwner } from "@/lib/domain/gallery-access";
import { DAY1_TEMPLATE, DAY3_TEMPLATE } from "@/lib/domain/submission-templates";

interface ArtworkOwnerRow {
  displayName?: string;
  anonymousIds: Array<{ anonymousId: string }>;
  _count: { submissions: number };
  submissions?: Array<{
    section: "DAY1" | "DAY3";
    templateVersion: string;
    day1Slots: Array<{ slotKey: string; cropX: number | null; cropY: number | null; cropScale: number | null; asset: { storageKey: string } | null }>;
    day3Bottles: Array<{ bottleKey: string; labelSnapshot: string; level: number | null; isConfirmed: boolean }>;
  }>;
}

interface RouteContext { params: Promise<{ publicId: string }> }

const DAY3_CONFIG = new Map(DAY3_TEMPLATE.bottles.map((bottle) => [bottle.bottleKey, bottle]));
const DAY1_CONFIG = new Map(DAY1_TEMPLATE.slots.map((slot) => [slot.slotKey, slot]));

export async function GET(request: Request, routeContext: RouteContext) {
  const context = await requireFormalViewer();
  if (!context.ok) return context.response;
  const { publicId } = await routeContext.params;
  let rateLimit;
  try {
    rateLimit = await consumePersistentRateLimit({ scope: "ARTWORK_READ", identity: `${clientRateLimitIdentity(request)}:${publicId}`, limit: 120, windowMs: 5 * 60 * 1000 });
  } catch {
    return NextResponse.json(failure("INTERNAL_ERROR", "作品服务暂时不可用", context.requestId), { status: 500 });
  }
  if (!rateLimit.allowed) return NextResponse.json(failure("RATE_LIMITED", "访问过于频繁", context.requestId), { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  const address = await prisma.artworkPublicId.findUnique({
    where: { publicId },
    select: { eventId: true, userId: true, revokedAt: true, user: { select: { id: true, status: true, role: true, groupId: true } } },
  });
  if (!address || address.eventId !== context.viewer.eventId || address.revokedAt || address.user.status !== "ACTIVE") {
    return NextResponse.json(failure("ARTWORK_NOT_FOUND", "作品不存在", context.requestId), { status: 404 });
  }
  const [settings, viewerSubmissions] = await Promise.all([
    prisma.eventSettings.findUnique({ where: { eventId: context.viewer.eventId } }),
    prisma.submission.findMany({
      where: { eventId: context.viewer.eventId, userId: context.viewer.userId, status: "SUBMITTED" },
      select: { section: true },
    }),
  ]);
  if (!settings) return NextResponse.json(failure("ARTWORK_NOT_FOUND", "作品不存在", context.requestId), { status: 404 });
  if (!canViewerAccessArtworkOwner(context.viewer, { userId: address.user.id, role: address.user.role, groupId: address.user.groupId }, settings)) {
    return NextResponse.json(failure("ARTWORK_NOT_FOUND", "作品不存在", context.requestId), { status: 404 });
  }
  const unlocked = context.viewer.role === "ADMIN" || context.viewer.userId === address.userId
    ? (["DAY1", "DAY3"] as const)
    : viewerSubmissions.map((item) => item.section);
  const owner = await prisma.user.findUnique({
    where: { id: address.userId },
    select: {
      ...(settings.showName && { displayName: true }),
      anonymousIds: { where: { eventId: context.viewer.eventId }, select: { anonymousId: true }, take: 1 },
      _count: { select: { submissions: { where: { status: "SUBMITTED" } } } },
      ...(settings.fullProfileVisible && {
        submissions: {
          where: { section: { in: [...unlocked] }, status: "SUBMITTED" },
          select: {
            section: true,
            templateVersion: true,
            day1Slots: {
              orderBy: { slotKey: "asc" },
              select: { slotKey: true, cropX: true, cropY: true, cropScale: true, asset: { select: { storageKey: true } } },
            },
            day3Bottles: { orderBy: { bottleKey: "asc" }, select: { bottleKey: true, labelSnapshot: true, level: true, isConfirmed: true } },
          },
        },
      }),
    },
  }) as ArtworkOwnerRow | null;
  if (!owner) return NextResponse.json(failure("ARTWORK_NOT_FOUND", "作品不存在", context.requestId), { status: 404 });
  const displayTitle = settings.showName && owner.displayName ? owner.displayName : owner.anonymousIds[0]?.anonymousId ?? "匿名作品";
  const hasAnyContent = owner._count.submissions > 0;
  if (!settings.fullProfileVisible || !hasAnyContent) {
    return NextResponse.json(
      success(
        {
          publicId,
          displayTitle,
          isAnonymous: !settings.showName,
          profileVisibility: "IDENTITY_ONLY",
          identityOnlyReason: hasAnyContent ? "EVENT_IDENTITY_ONLY" : "NO_CONTENT",
          navigation: { canReturnToGallery: viewerSubmissions.length > 0 || context.viewer.role === "ADMIN", canNavigateCollection: false },
        },
        context.requestId,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const submissions = owner.submissions ?? [];
  const sectionResult = (section: "DAY1" | "DAY3") => {
    if (!unlocked.includes(section)) return { state: "LOCKED" as const, content: null };
    const submission = submissions.find((item) => item.section === section);
    if (!submission) return { state: "NO_CONTENT" as const, content: null };
    return section === "DAY1"
      ? {
          state: "AVAILABLE" as const,
          content: {
            templateVersion: submission.templateVersion,
            slots: submission.day1Slots.map((slot) => ({
              slotKey: slot.slotKey,
              label: DAY1_CONFIG.get(slot.slotKey)?.label ?? "作品图片",
              imageUrl: slot.asset ? getThumbnailUrl(slot.asset.storageKey) : undefined,
              crop: { x: slot.cropX ?? 0.5, y: slot.cropY ?? 0.5, scale: slot.cropScale ?? 1 },
            })),
          },
        }
      : {
          state: "AVAILABLE" as const,
          content: {
            templateVersion: submission.templateVersion,
            bottles: submission.day3Bottles.map((bottle) => {
              const currentConfig = DAY3_CONFIG.get(bottle.bottleKey);
              return {
                bottleKey: bottle.bottleKey,
                // Copy corrections apply to existing submissions too. A retired
                // bottle still falls back to its historical snapshot.
                labelSnapshot: currentConfig?.label ?? bottle.labelSnapshot,
                level: bottle.level,
                isConfirmed: bottle.isConfirmed,
                group: currentConfig?.group ?? "LITTLE BOTTLES",
                groupSubtitle: currentConfig?.groupSubtitle ?? "",
              };
            }),
          },
        };
  };
  return NextResponse.json(
    success(
      {
        publicId,
        displayTitle,
        isAnonymous: !settings.showName,
        profileVisibility: "FULL",
        navigation: { canReturnToGallery: viewerSubmissions.length > 0 || context.viewer.role === "ADMIN", canNavigateCollection: false },
        sections: { DAY1: sectionResult("DAY1"), DAY3: sectionResult("DAY3") },
      },
      context.requestId,
    ),
    { headers: { "Cache-Control": "no-store" } },
  );
}
