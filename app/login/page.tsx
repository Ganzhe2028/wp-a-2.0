import LoginClient from "./LoginClient";
import { localLoginEnabled, oidcLoginEnabled } from "@/lib/server/auth-mode";
import { oidcConfigured } from "@/lib/server/oidc";
import { safeReturnTo } from "@/lib/safe-return-to";

export const metadata = { title: "登录" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; next?: string; ssoError?: string }> }) {
  const query = await searchParams;
  return (
    <LoginClient
      returnTo={safeReturnTo(query.returnTo || query.next)}
      localEnabled={localLoginEnabled()}
      oidcEnabled={oidcLoginEnabled()}
      oidcReady={oidcConfigured()}
      ssoError={query.ssoError || ""}
      returnToExplicit={Boolean(query.returnTo || query.next)}
    />
  );
}
