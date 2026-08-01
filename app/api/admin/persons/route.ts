import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createRequestId, failure, success } from "@/lib/contracts";
import { decideAccountDeletion } from "@/lib/domain/account-lifecycle";

export async function GET() {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const persons = await prisma.person.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      code: true,
      englishName: true,
      chineseName: true,
      grade: true,
      username: true,
      role: true,
      groupName: true,
      day1SubmittedAt: true,
      day3SubmittedAt: true,
      updatedAt: true,
      hidden: true,
      published: true,
      images: {
        orderBy: { sort: "asc" },
        select: {
          id: true,
          url: true,
          hidden: true,
          sort: true,
        },
      },
    },
  });

  return NextResponse.json({ persons });
}

export async function PATCH(request: NextRequest) {
  const requestId = createRequestId();

  if (!(await verifyAdminSession())) {
    return NextResponse.json(
      failure("UNAUTHENTICATED", "未登录", requestId),
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid body");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      failure("FORBIDDEN", "请求格式无效", requestId),
      { status: 400 },
    );
  }

  if (typeof body.id !== "string" || !body.id.trim()) {
    return NextResponse.json(
      failure("FORBIDDEN", "缺少账号 id", requestId),
      { status: 400 },
    );
  }

  const role =
    body.role === "SENIOR" || body.role === "ADMIN"
      ? body.role
      : "LEARNER";
  const chineseName =
    typeof body.chineseName === "string"
      ? body.chineseName.trim().slice(0, 40) || null
      : undefined;
  const groupName =
    typeof body.groupName === "string"
      ? body.groupName.trim().slice(0, 40) || null
      : undefined;

  const existing = await prisma.person.findUnique({
    where: { id: body.id },
    select: { id: true, role: true },
  });
  if (!existing) {
    return NextResponse.json(
      failure("FORBIDDEN", "账号不存在", requestId),
      { status: 404 },
    );
  }

  if (existing.role === "ADMIN" && role !== "ADMIN") {
    const adminCount = await prisma.person.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json(
        failure("FORBIDDEN", "不能降级最后一个管理员账号", requestId),
        { status: 409 },
      );
    }
  }

  const person = await prisma.person.update({
    where: { id: existing.id },
    data: {
      role,
      ...(chineseName !== undefined && { chineseName }),
      ...(groupName !== undefined && { groupName }),
    },
    select: {
      id: true,
      chineseName: true,
      role: true,
      groupName: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(success({ person }, requestId));
}

export async function DELETE() {
  const requestId = createRequestId();

  if (!(await verifyAdminSession())) {
    return NextResponse.json(
      failure("UNAUTHENTICATED", "未登录", requestId),
      { status: 401 },
    );
  }

  const decision = decideAccountDeletion();
  return NextResponse.json(
    failure(
      decision.code,
      "当前账号模型不支持安全归档，已拒绝物理删除",
      requestId,
    ),
    { status: 403 },
  );
}
