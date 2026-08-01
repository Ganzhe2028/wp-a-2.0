import { NextResponse } from "next/server";
import { success } from "@/lib/contracts";
import { prisma } from "@/lib/prisma";
import { requireFormalViewer } from "@/lib/server/student-request";
import { decideAuthoring } from "@/lib/domain/authoring";
import { DAY1_TEMPLATE, DAY3_TEMPLATE } from "@/lib/domain/submission-templates";

export async function GET() {
  const context = await requireFormalViewer();
  if (!context.ok) return context.response;
  const [settings, user, submissions] = await Promise.all([
    prisma.eventSettings.findUnique({ where: { eventId: context.viewer.eventId } }),
    prisma.user.findUniqueOrThrow({
      where: { id: context.viewer.userId },
      select: { displayName: true, anonymousIds: { where: { eventId: context.viewer.eventId }, select: { anonymousId: true }, take: 1 } },
    }),
    prisma.submission.findMany({
      where: { eventId: context.viewer.eventId, userId: context.viewer.userId },
      select: { section: true, status: true, day1Slots: { select: { id: true } }, day3Bottles: { where: { isConfirmed: true }, select: { id: true } } },
    }),
  ]);
  const bySection = (section: "DAY1" | "DAY3") => submissions.find((item) => item.section === section);
  const buildSection = (section: "DAY1" | "DAY3") => {
    const submission = bySection(section);
    const status = submission?.status ?? "NOT_STARTED";
    const authoring = decideAuthoring({ role: context.viewer.role, section, status, settings });
    const completed = section === "DAY1" ? submission?.day1Slots.length ?? 0 : submission?.day3Bottles.length ?? 0;
    const total = section === "DAY1" ? DAY1_TEMPLATE.slots.length : DAY3_TEMPLATE.bottles.length;
    const sectionOpen = settings ? section === "DAY1" ? settings.day1Open : settings.day3Open : false;
    return {
      status,
      canEnter: status !== "NOT_STARTED" || sectionOpen,
      canEdit: authoring.allowed,
      progress: { completed, total },
      action: status === "SUBMITTED" ? authoring.allowed ? "EDIT" : "VIEW" : authoring.allowed ? status === "DRAFT" ? "CONTINUE" : "CREATE" : sectionOpen ? "CLOSED" : "WAITING",
    };
  };
  const unlockedSections = submissions.filter((item) => item.status === "SUBMITTED").map((item) => item.section);
  const isAnonymous = settings?.showName !== true;
  return NextResponse.json(
    success(
      {
        identity: { displayTitle: isAnonymous ? user.anonymousIds[0]?.anonymousId ?? "匿名作品" : user.displayName, isAnonymous },
        capabilities: { authoringEnabled: settings?.authoringEnabled === true },
        day1: buildSection("DAY1"),
        day3: buildSection("DAY3"),
        browse: { visible: true, canEnter: context.viewer.role === "ADMIN" || unlockedSections.length > 0, unlockedSections: context.viewer.role === "ADMIN" ? ["DAY1", "DAY3"] : unlockedSections },
      },
      context.requestId,
    ),
    { headers: { "Cache-Control": "no-store" } },
  );
}
