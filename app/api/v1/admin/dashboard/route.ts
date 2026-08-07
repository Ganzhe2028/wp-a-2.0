import { NextResponse } from "next/server";
import { success } from "@/lib/contracts";
import { prisma } from "@/lib/prisma";
import { requireFormalAdmin } from "@/lib/server/admin-request";

export async function GET() {
  const context = await requireFormalAdmin();
  if (!context.ok) return context.response;
  const eventId = context.admin.eventId;
  const [settings, totalAccounts, eligibleAccounts, day1Submitted, day3Submitted] = await Promise.all([
    prisma.eventSettings.findUnique({ where: { eventId } }),
    prisma.user.count({ where: { eventId, status: "ACTIVE" } }),
    prisma.user.count({ where: { eventId, status: "ACTIVE", role: { in: ["LEARNER", "SENIOR", "COUNSELOR"] } } }),
    prisma.submission.count({ where: { eventId, section: "DAY1", status: "SUBMITTED", user: { status: "ACTIVE", role: { in: ["LEARNER", "SENIOR", "COUNSELOR"] } } } }),
    prisma.submission.count({ where: { eventId, section: "DAY3", status: "SUBMITTED", user: { status: "ACTIVE", role: { in: ["LEARNER", "SENIOR", "COUNSELOR"] } } } }),
  ]);
  return NextResponse.json(
    success(
      {
        phase: settings?.authoringEnabled
          ? settings.day1Open
            ? "DAY 1 创作"
            : settings.day3Open
              ? "DAY 3 创作"
              : "编写开放"
          : !settings?.showName
            ? "游戏进行"
            : settings?.fullProfileVisible === false
              ? "找礼包"
              : "活动前浏览",
        lastSyncedAt: settings?.updatedAt ?? null,
        provisionedAccountCount: totalAccounts,
        settings,
        completion: {
          day1: {
            submitted: day1Submitted,
            eligible: eligibleAccounts,
            percentage: eligibleAccounts ? Math.round(day1Submitted / eligibleAccounts * 100) : 0,
          },
          day3: {
            submitted: day3Submitted,
            eligible: eligibleAccounts,
            percentage: eligibleAccounts ? Math.round(day3Submitted / eligibleAccounts * 100) : 0,
          },
        },
      },
      context.requestId,
    ),
    { headers: { "Cache-Control": "no-store" } },
  );
}
