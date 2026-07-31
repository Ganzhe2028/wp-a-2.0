import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createRequestId, failure, success } from "@/lib/contracts";
import { isBlockedLegacyPrivilegeSetting } from "@/lib/domain/settings";

export async function GET() {
  const requestId = createRequestId();
  if (!(await verifyAdminSession())) {
    return NextResponse.json(
      failure("UNAUTHENTICATED", "未登录", requestId),
      { status: 401 },
    );
  }

  const settings = await prisma.systemSetting.findMany();
  const result: Record<string, string> = {};
  for (const s of settings) {
    result[s.key] = s.value;
  }

  return NextResponse.json(success(result, requestId));
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

  const { key, value } = body;
  if (!key || value === undefined) {
    return NextResponse.json(
      failure("FORBIDDEN", "缺少 key 或 value", requestId),
      { status: 400 },
    );
  }

  if (typeof key !== "string" || isBlockedLegacyPrivilegeSetting(key)) {
    return NextResponse.json(
      failure("FORBIDDEN", "该旧设置不能授予访问权限", requestId),
      { status: 403 },
    );
  }

  await prisma.systemSetting.upsert({
    where: { key },
    update: { value: String(value) },
    create: { key, value: String(value) },
  });

  return NextResponse.json(
    success({ key, value: String(value) }, requestId),
  );
}
