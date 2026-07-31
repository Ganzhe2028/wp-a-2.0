import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createRequestId, failure } from "@/lib/contracts";
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
