import { NextResponse } from "next/server";
import { failure, success } from "@/lib/contracts";
import { prisma } from "@/lib/prisma";
import { requireFormalAdmin } from "@/lib/server/admin-request";

const PAGE_SIZE = 100;

export async function GET(request: Request) {
  const context = await requireFormalAdmin();
  if (!context.ok) return context.response;
  const url = new URL(request.url);
  const action = url.searchParams.get("action")?.trim().slice(0, 100);
  const query = url.searchParams.get("query")?.trim().slice(0, 100);
  const actor = url.searchParams.get("actor")?.trim().slice(0, 100);
  const targetType = url.searchParams.get("targetType")?.trim().slice(0, 100);
  const targetId = url.searchParams.get("targetId")?.trim().slice(0, 100);
  const cursor = url.searchParams.get("cursor")?.trim().slice(0, 100);
  const fromValue = url.searchParams.get("from")?.trim();
  const toValue = url.searchParams.get("to")?.trim();
  const from = fromValue ? new Date(fromValue) : undefined;
  const to = toValue ? new Date(toValue) : undefined;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (from && to && from > to)) {
    return NextResponse.json(failure("VALIDATION_ERROR", "审计时间范围无效", context.requestId), { status: 400 });
  }

  const where = {
    eventId: context.admin.eventId,
    ...(action && { action }),
    ...(actor && { actor: { is: { accountCode: { contains: actor, mode: "insensitive" as const } } } }),
    ...(targetType && { targetType }),
    ...(targetId && { targetId }),
    ...((from || to) && { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
    ...(query && {
      OR: [
        { requestId: { contains: query } },
        { summary: { contains: query, mode: "insensitive" as const } },
        { action: { contains: query, mode: "insensitive" as const } },
        { targetType: { contains: query, mode: "insensitive" as const } },
        { targetId: { contains: query } },
        { actor: { is: { accountCode: { contains: query, mode: "insensitive" as const } } } },
      ],
    }),
  };
  const [logs, actions] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        requestId: true,
        summary: true,
        createdAt: true,
        actor: { select: { accountCode: true } },
      },
    }),
    prisma.adminAuditLog.groupBy({
      by: ["action"],
      where: { eventId: context.admin.eventId },
      orderBy: { action: "asc" },
    }),
  ]);
  const hasMore = logs.length > PAGE_SIZE;
  const page = hasMore ? logs.slice(0, PAGE_SIZE) : logs;
  const items = page.map((log) => ({
    id: log.id,
    createdAt: log.createdAt,
    actorLabel: log.actor?.accountCode ?? "SYSTEM",
    action: log.action,
    targetType: log.targetType,
    targetLabel: "受保护目标",
    summary: log.summary,
    requestId: log.requestId,
  }));
  return NextResponse.json(success({
    items,
    nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    actionOptions: actions.map((item) => item.action),
  }, context.requestId), {
    headers: { "Cache-Control": "no-store" },
  });
}
