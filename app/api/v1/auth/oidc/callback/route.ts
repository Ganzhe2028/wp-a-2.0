import { NextRequest, NextResponse } from "next/server";
import { createRequestId } from "@/lib/contracts";
import { oidcLoginEnabled } from "@/lib/server/auth-mode";
import { setUnifiedSessionCookie } from "@/lib/server/formal-session";
import { getRequestMetadata } from "@/lib/server/request-security";
import {
  bindOidcIdentityAndCreateSession,
  clearOidcFlowCookie,
  discoverOidc,
  exchangeOidcCode,
  getOidcConfiguration,
  OIDC_FLOW_COOKIE,
  safeOidcReturnTo,
  verifyOidcFlow,
  verifyOidcIdToken,
} from "@/lib/server/oidc";
import { clientRateLimitIdentity, consumePersistentRateLimit } from "@/lib/server/persistent-rate-limit";

function redirectWithError(request: NextRequest, code: string, returnTo?: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("ssoError", code);
  if (returnTo) url.searchParams.set("returnTo", safeOidcReturnTo(returnTo));
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(clearOidcFlowCookie());
  return response;
}

export async function GET(request: NextRequest) {
  if (!oidcLoginEnabled()) return redirectWithError(request, "disabled");
  try {
    const rateLimit = await consumePersistentRateLimit({ scope: "OIDC_CALLBACK", identity: clientRateLimitIdentity(request), limit: 30, windowMs: 15 * 60 * 1000 });
    if (!rateLimit.allowed) return redirectWithError(request, "rate_limited");
  } catch {
    return redirectWithError(request, "unavailable");
  }
  const returnedState = request.nextUrl.searchParams.get("state") || "";
  const code = request.nextUrl.searchParams.get("code") || "";
  const providerError = request.nextUrl.searchParams.get("error");
  const flowToken = request.cookies.get(OIDC_FLOW_COOKIE)?.value || "";
  if (providerError || !returnedState || !code || !flowToken) return redirectWithError(request, "cancelled");

  let returnTo = "/home";
  try {
    const flow = await verifyOidcFlow(flowToken, returnedState);
    returnTo = flow.returnTo;
    const config = getOidcConfiguration();
    const discovery = await discoverOidc(config);
    const idToken = await exchangeOidcCode({ config, discovery, code, codeVerifier: flow.codeVerifier });
    const identity = await verifyOidcIdToken({ config, discovery, idToken, nonce: flow.nonce });
    const session = await bindOidcIdentityAndCreateSession({
      ...identity,
      requestId: createRequestId(),
      metadata: getRequestMetadata(request),
    });
    const destination = !flow.returnToExplicit && session.account.role === "ADMIN" ? "/admin" : returnTo;
    const response = NextResponse.redirect(new URL(destination, request.url));
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(clearOidcFlowCookie());
    response.cookies.set(setUnifiedSessionCookie(session.token, session.expiresAt));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "OIDC_ACCOUNT_NOT_PROVISIONED") return redirectWithError(request, "not_provisioned", returnTo);
    if (message === "OIDC_ACCOUNT_ARCHIVED") return redirectWithError(request, "archived", returnTo);
    if (message === "OIDC_IDENTITY_CONFLICT") return redirectWithError(request, "conflict", returnTo);
    return redirectWithError(request, "failed", returnTo);
  }
}
