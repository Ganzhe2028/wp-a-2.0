import LoginClient from "./LoginClient";
import { localLoginEnabled, oidcLoginEnabled } from "@/lib/server/auth-mode";
import { oidcConfigured } from "@/lib/server/oidc";

export const metadata = { title: "登录" };

function safeReturnTo(value?: string) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/home";
}

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
