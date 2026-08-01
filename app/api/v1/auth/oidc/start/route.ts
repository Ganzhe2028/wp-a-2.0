import { NextRequest, NextResponse } from "next/server";
import { oidcLoginEnabled } from "@/lib/server/auth-mode";
import {
  createOidcAuthorizationMaterial,
  discoverOidc,
  getOidcConfiguration,
  oidcFlowCookie,
  signOidcFlow,
} from "@/lib/server/oidc";
import { clientRateLimitIdentity, consumePersistentRateLimit } from "@/lib/server/persistent-rate-limit";

export async function GET(request: NextRequest) {
  if (!oidcLoginEnabled()) return NextResponse.redirect(new URL("/login?ssoError=disabled", request.url));
  try {
    const rateLimit = await consumePersistentRateLimit({ scope: "OIDC_START", identity: clientRateLimitIdentity(request), limit: 30, windowMs: 15 * 60 * 1000 });
    if (!rateLimit.allowed) return NextResponse.redirect(new URL("/login?ssoError=rate_limited", request.url));
    const config = getOidcConfiguration();
    const discovery = await discoverOidc(config);
    const material = createOidcAuthorizationMaterial(request.nextUrl.searchParams.get("returnTo"));
    const flowToken = await signOidcFlow(material);
    const authorizationUrl = new URL(discovery.authorization_endpoint);
    authorizationUrl.searchParams.set("client_id", config.clientId);
    authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", "openid email profile");
    authorizationUrl.searchParams.set("state", material.state);
    authorizationUrl.searchParams.set("nonce", material.nonce);
    authorizationUrl.searchParams.set("code_challenge", material.codeChallenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    const response = NextResponse.redirect(authorizationUrl);
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(oidcFlowCookie(flowToken));
    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?ssoError=unavailable", request.url));
  }
}
