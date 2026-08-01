import { NextResponse } from "next/server";
import { createRequestId, failure, success } from "@/lib/contracts";
import {
  clearUnifiedSessionCookie,
  revokeCurrentFormalSession,
} from "@/lib/server/formal-session";
import { hasTrustedWriteOrigin } from "@/lib/server/request-security";

export async function POST(request: Request) {
  const requestId = createRequestId();
  if (!hasTrustedWriteOrigin(request)) {
    return NextResponse.json(failure("FORBIDDEN", "请求来源无效", requestId), { status: 403 });
  }
  await revokeCurrentFormalSession();
  const response = NextResponse.json(success({ loggedOut: true }, requestId), {
    headers: { "Cache-Control": "no-store" },
  });
  response.cookies.set(clearUnifiedSessionCookie());
  return response;
}
