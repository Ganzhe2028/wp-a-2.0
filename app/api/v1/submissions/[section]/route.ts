import { NextResponse } from "next/server";
import { failure, success } from "@/lib/contracts";
import { prisma } from "@/lib/prisma";
import { requireFormalViewer } from "@/lib/server/student-request";
import { decideAuthoring } from "@/lib/domain/authoring";
import { DAY1_TEMPLATE, DAY3_TEMPLATE, parseFormalSection } from "@/lib/domain/submission-templates";
import { getPublicUrl, getThumbnailUrl } from "@/lib/r2";

interface RouteContext { params: Promise<{ section: string }> }

export async function GET(_request: Request, routeContext: RouteContext) {
  const context = await requireFormalViewer();
  if (!context.ok) return context.response;
  const section = parseFormalSection((await routeContext.params).section);
  if (!section) return NextResponse.json(failure("VALIDATION_ERROR", "Section 无效", context.requestId), { status: 400 });
  const [settings, submission, publicAddress] = await Promise.all([
    prisma.eventSettings.findUnique({ where: { eventId: context.viewer.eventId } }),
    prisma.submission.findUnique({
      where: { eventId_userId_section: { eventId: context.viewer.eventId, userId: context.viewer.userId, section } },
      include: {
        day1Slots: { include: { asset: { select: { storageKey: true } } }, orderBy: { slotKey: "asc" } },
        day3Bottles: { orderBy: { bottleKey: "asc" } },
      },
    }),
    prisma.artworkPublicId.findFirst({ where: { eventId: context.viewer.eventId, userId: context.viewer.userId, revokedAt: null }, select: { publicId: true } }),
  ]);
  const status = submission?.status ?? "NOT_STARTED";
  const authoring = decideAuthoring({ role: context.viewer.role, section, status, settings });
  const common = {
    status,
    version: submission?.version ?? 1,
    canAuthor: authoring.allowed,
    ...(!authoring.allowed && { readOnlyReason: authoring.code }),
    publicId: publicAddress?.publicId ?? "",
  };
  const data = section === "DAY1"
    ? {
        ...common,
        template: DAY1_TEMPLATE,
        slots: submission?.day1Slots.filter((slot) => slot.assetId).map((slot) => ({
          slotKey: slot.slotKey,
          assetId: slot.assetId!,
          imageUrl: slot.asset ? getThumbnailUrl(slot.asset.storageKey) : undefined,
          originalUrl: slot.asset ? getPublicUrl(slot.asset.storageKey) : undefined,
          crop: { x: slot.cropX ?? 0.5, y: slot.cropY ?? 0.5, scale: slot.cropScale ?? 1 },
        })) ?? [],
      }
    : {
        ...common,
        template: DAY3_TEMPLATE,
        bottles: DAY3_TEMPLATE.bottles.map((config) => {
          const value = submission?.day3Bottles.find((item) => item.bottleKey === config.bottleKey);
          return { bottleKey: config.bottleKey, level: value?.level ?? null, isConfirmed: value?.isConfirmed ?? false };
        }),
      };
  return NextResponse.json(success(data, context.requestId), { headers: { "Cache-Control": "no-store" } });
}
