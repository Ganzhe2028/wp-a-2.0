import { NextResponse } from "next/server";
import type { Prisma } from "@/app/generated/prisma/client";
import { success } from "@/lib/contracts";
import { prisma } from "@/lib/prisma";
import { requireFormalAdmin } from "@/lib/server/admin-request";

const PAGE_SIZE = 100;

export async function GET(request: Request) {
  const context = await requireFormalAdmin();
  if (!context.ok) return context.response;
  const url = new URL(request.url);
  const query = url.searchParams.get("query")?.trim().slice(0, 80);
  const role = url.searchParams.get("role");
  const status = url.searchParams.get("status");
  const groupId = url.searchParams.get("groupId");
  const day1Status = url.searchParams.get("day1Status");
  const day3Status = url.searchParams.get("day3Status");
  const cursor = url.searchParams.get("cursor");
  const sort = url.searchParams.get("sort") || "name_asc";
  const validSubmissionStatus = (value: string | null) =>
    value === "NOT_STARTED" || value === "DRAFT" || value === "SUBMITTED";
  const submissionFilter = (section: "DAY1" | "DAY3", value: string | null): Prisma.UserWhereInput => {
    if (!validSubmissionStatus(value)) return {};
    if (value === "NOT_STARTED") {
      return { NOT: { submissions: { some: { section, status: { in: ["DRAFT", "SUBMITTED"] } } } } };
    }
    return { submissions: { some: { section, status: value as "DRAFT" | "SUBMITTED" } } };
  };
  const orderBy: Prisma.UserOrderByWithRelationInput[] = [
    { protectedSystemAdmin: "desc" },
    { status: "asc" },
  ];
  if (sort === "name_desc") orderBy.push({ displayNameSortKey: "desc" });
  else if (sort === "group_asc") orderBy.push({ group: { name: "asc" } }, { displayNameSortKey: "asc" });
  else if (sort === "last_login_desc") orderBy.push({ lastLoginAt: { sort: "desc", nulls: "last" } });
  else orderBy.push({ displayNameSortKey: "asc" });
  orderBy.push({ id: "asc" });

  const [accounts, groups] = await Promise.all([
    prisma.user.findMany({
      where: {
        eventId: context.admin.eventId,
        AND: [submissionFilter("DAY1", day1Status), submissionFilter("DAY3", day3Status)],
        ...(query && {
          OR: [
            { accountCode: { contains: query, mode: "insensitive" } },
            { displayName: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { group: { name: { contains: query, mode: "insensitive" } } },
          ],
        }),
        ...(role === "LEARNER" || role === "SENIOR" || role === "ADMIN" ? { role } : {}),
        ...(status === "ACTIVE" || status === "ARCHIVED" ? { status } : {}),
        ...(groupId && { groupId }),
      },
      orderBy,
      take: PAGE_SIZE + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true,
        accountCode: true,
        displayName: true,
        email: true,
        role: true,
        status: true,
        groupId: true,
        group: { select: { name: true } },
        version: true,
        protectedSystemAdmin: true,
        lastLoginAt: true,
        anonymousIds: {
          where: { eventId: context.admin.eventId },
          select: { anonymousId: true },
          take: 1,
        },
        submissions: { select: { section: true, status: true } },
        oidcIdentities: { select: { id: true }, take: 1 },
        externalSubject: true,
      },
    }),
    prisma.group.findMany({
      where: { eventId: context.admin.eventId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, _count: { select: { users: true } } },
    }),
  ]);
  const hasMore = accounts.length > PAGE_SIZE;
  const page = hasMore ? accounts.slice(0, PAGE_SIZE) : accounts;
  const items = page.map(({ anonymousIds, submissions, oidcIdentities, group, ...account }) => ({
    ...account,
    groupName: group?.name ?? null,
    day1Status: submissions.find((item) => item.section === "DAY1")?.status ?? "NOT_STARTED",
    day3Status: submissions.find((item) => item.section === "DAY3")?.status ?? "NOT_STARTED",
    anonymousId: anonymousIds[0]?.anonymousId ?? null,
    oidcBound: oidcIdentities.length > 0 || Boolean(account.externalSubject),
    isSystemInitialAdmin: account.protectedSystemAdmin,
  }));
  return NextResponse.json(
    success({ items, nextCursor: hasMore ? page.at(-1)?.id ?? null : null, groups: groups.map((item) => ({ id: item.id, name: item.name, memberCount: item._count.users })) }, context.requestId),
    { headers: { "Cache-Control": "no-store" } },
  );
}
