export type AuthMode = "LOCAL_ONLY" | "HYBRID" | "OIDC_ONLY";

export function getAuthMode(): AuthMode {
  const value = (process.env.AUTH_MODE || "LOCAL_ONLY").trim().toUpperCase();
  if (value === "LOCAL" || value === "LOCAL_ONLY") return "LOCAL_ONLY";
  if (value === "HYBRID") return "HYBRID";
  if (value === "OIDC" || value === "OIDC_ONLY") return "OIDC_ONLY";
  return "LOCAL_ONLY";
}

export function localLoginEnabled(): boolean {
  return getAuthMode() !== "OIDC_ONLY";
}

export function oidcLoginEnabled(): boolean {
  return getAuthMode() !== "LOCAL_ONLY";
}
