import { NextResponse } from "next/server";
import { createRequestId, failure } from "@/lib/contracts";
import { getFormalSession, type FormalSessionUser } from "@/lib/server/formal-session";
import { hasTrustedWriteOrigin } from "@/lib/server/request-security";

export type StudentRequestContext =
  | { ok: true; requestId: string; viewer: FormalSessionUser }
  | { ok: false; response: NextResponse };

export async function requireFormalViewer(request?: Request, options: { write?: boolean } = {}): Promise<StudentRequestContext> {
  const requestId = createRequestId();
  if (options.write && request && !hasTrustedWriteOrigin(request)) {
    return { ok: false, response: NextResponse.json(failure("FORBIDDEN", "请求来源无效", requestId), { status: 403 }) };
  }
  const viewer = await getFormalSession();
  if (!viewer) {
    return { ok: false, response: NextResponse.json(failure("UNAUTHENTICATED", "未登录", requestId), { status: 401 }) };
  }
  return { ok: true, requestId, viewer };
}
