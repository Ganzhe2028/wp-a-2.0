import { NextResponse } from "next/server";
import { failure, success } from "@/lib/contracts";
import { prisma } from "@/lib/prisma";
import { requireFormalViewer } from "@/lib/server/student-request";
import { parseFormalSection } from "@/lib/domain/submission-templates";
import { createGallerySeed, decodeGalleryCursor, encodeGalleryCursor, galleryShuffleKey } from "@/lib/server/gallery-cursor";
import { resolveGalleryBrowseScope } from "@/lib/domain/gallery-access";
import { consumePersistentRateLimit } from "@/lib/server/persistent-rate-limit";
import { digestSensitive } from "@/lib/server/request-security";
import { getThumbnailUrl } from "@/lib/r2";
import { createHash } from "node:crypto";

interface GalleryUserRow {
  id: string;
  role: "LEARNER" | "SENIOR" | "ADMIN";
  displayName?: string;
  displayNameSortKey?: string;
  anonymousIds: Array<{ anonymousId: string }>;
  artworkPublicIds: Array<{ publicId: string }>;
  submissions: Array<{
    status: "NOT_STARTED" | "DRAFT" | "SUBMITTED";
    day1Slots?: Array<{ asset: { storageKey: string } | null }>;
  }>;
}

export async function GET(request: Request) {
  const context = await requireFormalViewer();
  if (!context.ok) return context.response;
  let rateLimit;
  try {
    rateLimit = await consumePersistentRateLimit({ scope: "GALLERY_READ", identity: context.viewer.userId, limit: 120, windowMs: 5 * 60 * 1000 });
  } catch {
    return NextResponse.json(failure("INTERNAL_ERROR", "浏览服务暂时不可用", context.requestId), { status: 500 });
  }
  if (!rateLimit.allowed) {
    return NextResponse.json(failure("RATE_LIMITED", "请求过于频繁", context.requestId), { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  }
  const url = new URL(request.url);
  const section = parseFormalSection(url.searchParams.get("section") || "");
  const division = url.searchParams.get("division");
  const query = url.searchParams.get("query")?.trim().slice(0, 80);
  const onlyWithContent = url.searchParams.get("filled") === "true";
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 30));
  if (!section || (division !== "SENIOR" && division !== "LEARNER")) {
    return NextResponse.json(failure("VALIDATION_ERROR", "Gallery 参数无效", context.requestId), { status: 400 });
  }
  const galleryDivision: "SENIOR" | "LEARNER" = division;
  const [settings, viewerSubmission] = await Promise.all([
    prisma.eventSettings.findUnique({ where: { eventId: context.viewer.eventId } }),
    prisma.submission.findUnique({ where: { eventId_userId_section: { eventId: context.viewer.eventId, userId: context.viewer.userId, section } }, select: { status: true } }),
  ]);
  if (!settings) return NextResponse.json(failure("FORBIDDEN", "活动设置不可用", context.requestId), { status: 503 });
  if (context.viewer.role !== "ADMIN" && viewerSubmission?.status !== "SUBMITTED") {
    return NextResponse.json(failure("SECTION_LOCKED_FOR_VIEWER", "完成对应作品后即可浏览", context.requestId), { status: 403 });
  }
  const browseScope = resolveGalleryBrowseScope(context.viewer, settings);
  if (!settings.showName && query && !/^[!@#$%&*+?=]{8}$/.test(query)) {
    return NextResponse.json(success({ viewer: { unlockedSections: [section], browseScope }, items: [], nextCursor: null }, context.requestId));
  }
  const accountScope = browseScope === "OWN_GROUP_LEARNERS"
    ? galleryDivision === "LEARNER" && context.viewer.groupId
      ? { role: "LEARNER" as const, groupId: context.viewer.groupId }
      : { id: "__senior_group_scope_empty__" }
    : { role: galleryDivision === "SENIOR" ? "SENIOR" as const : "LEARNER" as const };
  const users = await prisma.user.findMany({
    where: {
      eventId: context.viewer.eventId,
      status: "ACTIVE",
      ...accountScope,
      artworkPublicIds: { some: { eventId: context.viewer.eventId, revokedAt: null } },
      ...(onlyWithContent && { submissions: { some: { section, status: "SUBMITTED" } } }),
      ...(query && (settings.showName
        ? { displayName: { contains: query, mode: "insensitive" } }
        : { anonymousIds: { some: { eventId: context.viewer.eventId, anonymousId: query } } })),
    },
    select: {
      id: true,
      role: true,
      ...(settings.showName && { displayName: true }),
      displayNameSortKey: settings.showName,
      anonymousIds: { where: { eventId: context.viewer.eventId }, select: { anonymousId: true }, take: 1 },
      artworkPublicIds: { where: { eventId: context.viewer.eventId, revokedAt: null }, select: { publicId: true }, take: 1 },
      submissions: {
        where: { section },
        select: {
          status: true,
          ...(settings.fullProfileVisible && section === "DAY1" && {
            day1Slots: { where: { assetId: { not: null } }, orderBy: { slotKey: "asc" }, take: 1, select: { asset: { select: { storageKey: true } } } },
          }),
        },
        take: 1,
      },
    },
    take: 1000,
  }) as unknown as GalleryUserRow[];
  const cursorToken = url.searchParams.get("cursor");
  const queryHash = createHash("sha256").update(query ?? "").digest("hex");
  const accessScopeHash = digestSensitive(`${browseScope}\0${context.viewer.groupId ?? ""}`);
  const cursorBinding = { section, division: galleryDivision, queryHash, onlyWithContent, accessScopeHash, showName: settings.showName, settingsVersion: settings.version };
  const decoded = cursorToken ? decodeGalleryCursor(cursorToken, cursorBinding) : null;
  if (cursorToken && !decoded) return NextResponse.json(failure("VALIDATION_ERROR", "Cursor 无效", context.requestId), { status: 400 });
  const seed = decoded?.seed ?? createGallerySeed();
  const sortKey = (user: GalleryUserRow) => !settings.showName && galleryDivision === "LEARNER"
    ? galleryShuffleKey(seed, user.id)
    : `${user.displayNameSortKey ?? ""}\0${user.id}`;
  users.sort((left, right) => sortKey(left).localeCompare(sortKey(right)));
  const startIndex = decoded?.after ? users.findIndex((user) => sortKey(user).localeCompare(decoded.after!) > 0) : 0;
  const page = startIndex < 0 ? [] : users.slice(startIndex, startIndex + limit);
  const items = page.map((user) => {
    const submission = user.submissions[0];
    const hasContent = submission?.status === "SUBMITTED";
    const storageKey = hasContent ? submission.day1Slots?.[0]?.asset?.storageKey : undefined;
    return {
      publicId: user.artworkPublicIds[0].publicId,
      displayTitle: settings.showName && user.displayName ? user.displayName : user.anonymousIds[0]?.anonymousId ?? "匿名作品",
      ...(galleryDivision === "SENIOR" && { roleLabel: "Senior Group" }),
      thumbnail: settings.fullProfileVisible && section === "DAY1" && storageKey ? { url: getThumbnailUrl(storageKey) } : null,
      sectionStates: { [section]: hasContent ? "AVAILABLE" : "NO_CONTENT" },
    };
  });
  const last = page.at(-1);
  const hasMore = Boolean(last) && users.some((user) => sortKey(user).localeCompare(sortKey(last!)) > 0);
  const nextCursor = hasMore && last ? encodeGalleryCursor({ seed, after: sortKey(last), ...cursorBinding }) : null;
  return NextResponse.json(success({ viewer: { unlockedSections: [section], browseScope }, items, nextCursor }, context.requestId), { headers: { "Cache-Control": "no-store" } });
}
