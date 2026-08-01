import { NextResponse } from "next/server";
import { createRequestId, failure } from "@/lib/contracts";
import { getFormalSession, type FormalSessionUser } from "@/lib/server/formal-session";
import { hasTrustedWriteOrigin } from "@/lib/server/request-security";
import { consumePersistentRateLimit } from "@/lib/server/persistent-rate-limit";

export type AdminRequestContext =
  | { ok: true; requestId: string; admin: FormalSessionUser }
  | { ok: false; response: NextResponse };

export async function requireFormalAdmin(
  request?: Request,
  options: { write?: boolean } = {},
): Promise<AdminRequestContext> {
  const requestId = createRequestId();
  if (options.write && request && !hasTrustedWriteOrigin(request)) {
    return {
      ok: false,
      response: NextResponse.json(failure("FORBIDDEN", "请求来源无效", requestId), { status: 403 }),
    };
  }
  const admin = await getFormalSession();
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json(failure("UNAUTHENTICATED", "未登录", requestId), { status: 401 }),
    };
  }
  if (admin.role !== "ADMIN") {
    return {
      ok: false,
      response: NextResponse.json(failure("FORBIDDEN", "需要管理员权限", requestId), { status: 403 }),
    };
  }
  if (options.write) {
    let rateLimit;
    try {
      rateLimit = await consumePersistentRateLimit({
        scope: "ADMIN_WRITE",
        identity: admin.userId,
        limit: 300,
        windowMs: 15 * 60 * 1000,
      });
    } catch {
      return {
        ok: false,
        response: NextResponse.json(failure("INTERNAL_ERROR", "管理服务暂时不可用", requestId), {
          status: 500,
          headers: { "Cache-Control": "no-store" },
        }),
      };
    }
    if (!rateLimit.allowed) {
      return {
        ok: false,
        response: NextResponse.json(failure("RATE_LIMITED", "管理操作过于频繁", requestId), {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds), "Cache-Control": "no-store" },
        }),
      };
    }
  }
  return { ok: true, requestId, admin };
}
