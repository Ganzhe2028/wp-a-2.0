import { NextResponse } from "next/server";
import { createRequestId, failure, success } from "@/lib/contracts";
import { authenticateLocalAccount } from "@/lib/server/local-auth";
import { getRequestMetadata, hasTrustedWriteOrigin } from "@/lib/server/request-security";
import { setUnifiedSessionCookie } from "@/lib/server/formal-session";
import { clientRateLimitIdentity, consumePersistentRateLimit } from "@/lib/server/persistent-rate-limit";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function handleFormalLogin(request: Request, requiredRole?: "ADMIN") {
  const requestId = createRequestId();
  if (!hasTrustedWriteOrigin(request)) {
    return NextResponse.json(failure("FORBIDDEN", "请求来源无效", requestId), { status: 403 });
  }

  let accountCode: string;
  let password: string;
  let returnTo: string | undefined;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid");
    const record = body as Record<string, unknown>;
    accountCode = typeof record.accountCode === "string" ? record.accountCode.trim() : "";
    password = typeof record.password === "string" ? record.password : "";
    returnTo = typeof record.returnTo === "string" && record.returnTo.startsWith("/") && !record.returnTo.startsWith("//")
      ? record.returnTo
      : undefined;
    if (!accountCode || !password) throw new Error("invalid");
  } catch {
    return NextResponse.json(
      failure("VALIDATION_ERROR", "账号编号和密码不能为空", requestId),
      { status: 400 },
    );
  }

  let ipLimit;
  let accountLimit;
  try {
    [ipLimit, accountLimit] = await Promise.all([
      consumePersistentRateLimit({ scope: "FORMAL_LOGIN_IP", identity: clientRateLimitIdentity(request), limit: 20, windowMs: LOGIN_WINDOW_MS }),
      consumePersistentRateLimit({ scope: "FORMAL_LOGIN_ACCOUNT", identity: accountCode.toLocaleLowerCase("en-US"), limit: 5, windowMs: LOGIN_WINDOW_MS }),
    ]);
  } catch {
    return NextResponse.json(failure("INTERNAL_ERROR", "登录暂时不可用", requestId), {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (!ipLimit.allowed || !accountLimit.allowed) {
    const retryAfter = Math.max(ipLimit.retryAfterSeconds, accountLimit.retryAfterSeconds);
    return NextResponse.json(failure("RATE_LIMITED", "登录尝试过多", requestId), {
      status: 429,
      headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" },
    });
  }

  try {
    const result = await authenticateLocalAccount({
      accountCode,
      password,
      requiredRole,
      metadata: getRequestMetadata(request),
    });
    if (!result.ok) {
      const code = result.reason === "ACCOUNT_ARCHIVED" ? "ACCOUNT_ARCHIVED" : result.reason === "FORBIDDEN" || result.reason === "LOCAL_LOGIN_DISABLED" ? "FORBIDDEN" : "UNAUTHENTICATED";
      const status = code === "UNAUTHENTICATED" ? 401 : 403;
      return NextResponse.json(failure(code, "账号或密码无效", requestId), {
        status,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const account = { ...result.account, userId: result.account.id, isSystemInitialAdmin: result.account.protectedSystemAdmin };
    const response = NextResponse.json(success({ account, ...(returnTo && { returnTo }) }, requestId), {
      headers: { "Cache-Control": "no-store" },
    });
    response.cookies.set(setUnifiedSessionCookie(result.token, result.expiresAt));
    return response;
  } catch {
    return NextResponse.json(failure("INTERNAL_ERROR", "登录暂时不可用", requestId), {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
