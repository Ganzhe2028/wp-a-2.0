import { NextResponse } from "next/server";
import { createRequestId, success } from "@/lib/contracts";
import { getAuthMode, localLoginEnabled, oidcLoginEnabled } from "@/lib/server/auth-mode";
import { oidcConfigured } from "@/lib/server/oidc";

export async function GET() {
  const requestId = createRequestId();
  return NextResponse.json(success({
    mode: getAuthMode(),
    localEnabled: localLoginEnabled(),
    oidcEnabled: oidcLoginEnabled(),
    oidcReady: oidcConfigured(),
  }, requestId), { headers: { "Cache-Control": "no-store" } });
}
