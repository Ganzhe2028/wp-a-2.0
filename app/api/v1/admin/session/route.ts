import { NextResponse } from "next/server";
import { createRequestId, failure, success } from "@/lib/contracts";
import { getFormalSession } from "@/lib/server/formal-session";

export async function GET() {
  const requestId = createRequestId();
  const session = await getFormalSession();
  if (!session) {
    return NextResponse.json(failure("UNAUTHENTICATED", "未登录", requestId), {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json(failure("FORBIDDEN", "需要管理员权限", requestId), {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json(success({ authed: true, account: { ...session, id: session.userId, isSystemInitialAdmin: session.protectedSystemAdmin } }, requestId), {
    headers: { "Cache-Control": "no-store" },
  });
}
