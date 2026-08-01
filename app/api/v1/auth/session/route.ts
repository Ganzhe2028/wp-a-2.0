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
  return NextResponse.json(success({ account: session }, requestId), {
    headers: { "Cache-Control": "no-store" },
  });
}
