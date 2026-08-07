import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createFormalSessionInTransaction } from "@/lib/server/formal-session";
import { writeAuditLog } from "@/lib/server/audit";
import type { RequestMetadata } from "@/lib/server/request-security";

export const OIDC_FLOW_COOKIE = "owk_oidc_flow";
const FLOW_ISSUER = "oweek-oidc-flow";
const FLOW_AUDIENCE = "oweek-oidc-callback";
const FLOW_TTL_SECONDS = 10 * 60;

export interface OidcConfiguration {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  token_endpoint_auth_methods_supported?: string[];
}

export interface OidcFlow {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  returnToExplicit: boolean;
}

function sessionSecret(): Uint8Array {
  const value = process.env.SESSION_SECRET?.trim();
  if (!value) throw new Error("OIDC_SESSION_SECRET_MISSING");
  return new TextEncoder().encode(value);
}

function normalizeIssuer(value: string): string {
  return new URL(value).toString().replace(/\/$/, "");
}

function requireSecureUrl(value: string, label: string): string {
  const url = new URL(value);
  const localDevelopment = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localDevelopment) throw new Error(`OIDC_${label}_INSECURE`);
  return url.toString();
}

export function getOidcConfiguration(): OidcConfiguration {
  const issuer = process.env.OIDC_ISSUER?.trim();
  const clientId = process.env.OIDC_CLIENT_ID?.trim();
  const clientSecret = process.env.OIDC_CLIENT_SECRET?.trim();
  const redirectUri = process.env.OIDC_REDIRECT_URI?.trim();
  if (!issuer || !clientId || !clientSecret || !redirectUri) throw new Error("OIDC_CONFIGURATION_MISSING");
  return {
    issuer: normalizeIssuer(requireSecureUrl(issuer, "ISSUER")),
    clientId,
    clientSecret,
    redirectUri: requireSecureUrl(redirectUri, "REDIRECT_URI"),
  };
}

export function oidcConfigured(): boolean {
  try {
    getOidcConfiguration();
    return true;
  } catch {
    return false;
  }
}

import { safeReturnTo } from "@/lib/safe-return-to";

export function safeOidcReturnTo(value: string | null | undefined): string {
  return safeReturnTo(value);
}

export async function discoverOidc(config: OidcConfiguration): Promise<OidcDiscovery> {
  const discoveryUrl = `${config.issuer}/.well-known/openid-configuration`;
  const response = await fetch(discoveryUrl, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error("OIDC_DISCOVERY_FAILED");
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("OIDC_DISCOVERY_INVALID");
  const discovery = value as Partial<OidcDiscovery>;
  if (
    typeof discovery.issuer !== "string" ||
    typeof discovery.authorization_endpoint !== "string" ||
    typeof discovery.token_endpoint !== "string" ||
    typeof discovery.jwks_uri !== "string" ||
    normalizeIssuer(discovery.issuer) !== config.issuer
  ) {
    throw new Error("OIDC_DISCOVERY_INVALID");
  }
  requireSecureUrl(discovery.authorization_endpoint, "AUTHORIZATION_ENDPOINT");
  requireSecureUrl(discovery.token_endpoint, "TOKEN_ENDPOINT");
  requireSecureUrl(discovery.jwks_uri, "JWKS_URI");
  return discovery as OidcDiscovery;
}

export function createOidcAuthorizationMaterial(returnTo?: string | null): OidcFlow & { codeChallenge: string } {
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { state, nonce, codeVerifier, codeChallenge, returnTo: safeOidcReturnTo(returnTo), returnToExplicit: Boolean(returnTo) };
}

export async function signOidcFlow(flow: OidcFlow): Promise<string> {
  return new SignJWT({ nonce: flow.nonce, codeVerifier: flow.codeVerifier, returnTo: flow.returnTo, returnToExplicit: flow.returnToExplicit })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(FLOW_ISSUER)
    .setAudience(FLOW_AUDIENCE)
    .setSubject(flow.state)
    .setIssuedAt()
    .setExpirationTime(`${FLOW_TTL_SECONDS}s`)
    .sign(sessionSecret());
}

export async function verifyOidcFlow(token: string, returnedState: string): Promise<OidcFlow> {
  const { payload } = await jwtVerify(token, sessionSecret(), {
    algorithms: ["HS256"],
    issuer: FLOW_ISSUER,
    audience: FLOW_AUDIENCE,
    requiredClaims: ["sub", "nonce", "codeVerifier", "returnTo", "returnToExplicit", "exp", "iat"],
  });
  const state = typeof payload.sub === "string" ? payload.sub : "";
  const nonce = typeof payload.nonce === "string" ? payload.nonce : "";
  const codeVerifier = typeof payload.codeVerifier === "string" ? payload.codeVerifier : "";
  const returnTo = typeof payload.returnTo === "string" ? safeOidcReturnTo(payload.returnTo) : "/home";
  const returnToExplicit = payload.returnToExplicit === true;
  const left = Buffer.from(state);
  const right = Buffer.from(returnedState);
  if (!state || left.length !== right.length || !timingSafeEqual(left, right) || !nonce || !codeVerifier) {
    throw new Error("OIDC_FLOW_INVALID");
  }
  return { state, nonce, codeVerifier, returnTo, returnToExplicit };
}

export function oidcFlowCookie(value: string) {
  return {
    name: OIDC_FLOW_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/v1/auth/oidc",
    maxAge: FLOW_TTL_SECONDS,
  };
}

export function clearOidcFlowCookie() {
  return { ...oidcFlowCookie(""), maxAge: 0 };
}

export async function exchangeOidcCode(input: {
  config: OidcConfiguration;
  discovery: OidcDiscovery;
  code: string;
  codeVerifier: string;
}): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.config.redirectUri,
    code_verifier: input.codeVerifier,
  });
  const supported = input.discovery.token_endpoint_auth_methods_supported;
  const useBasic = !supported || supported.includes("client_secret_basic");
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (useBasic) {
    headers.Authorization = `Basic ${Buffer.from(`${input.config.clientId}:${input.config.clientSecret}`).toString("base64")}`;
  } else if (supported?.includes("client_secret_post")) {
    body.set("client_id", input.config.clientId);
    body.set("client_secret", input.config.clientSecret);
  } else {
    throw new Error("OIDC_TOKEN_AUTH_METHOD_UNSUPPORTED");
  }
  const response = await fetch(input.discovery.token_endpoint, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("OIDC_TOKEN_EXCHANGE_FAILED");
  const value: unknown = await response.json();
  const idToken = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>).id_token
    : undefined;
  if (typeof idToken !== "string" || !idToken) throw new Error("OIDC_ID_TOKEN_MISSING");
  return idToken;
}

function constantStringEqual(leftValue: unknown, rightValue: string): boolean {
  if (typeof leftValue !== "string") return false;
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function verifyOidcIdToken(input: {
  config: OidcConfiguration;
  discovery: OidcDiscovery;
  idToken: string;
  nonce: string;
}): Promise<{ issuer: string; subject: string; email: string }> {
  const jwks = createRemoteJWKSet(new URL(input.discovery.jwks_uri), { timeoutDuration: 5_000 });
  const { payload } = await jwtVerify(input.idToken, jwks, {
    issuer: input.discovery.issuer,
    audience: input.config.clientId,
    requiredClaims: ["iss", "sub", "aud", "exp", "iat", "nonce", "email", "email_verified"],
  });
  if (!constantStringEqual(payload.nonce, input.nonce)) throw new Error("OIDC_NONCE_INVALID");
  if (payload.email_verified !== true || typeof payload.email !== "string" || !payload.email.trim()) {
    throw new Error("OIDC_EMAIL_NOT_VERIFIED");
  }
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("OIDC_SUBJECT_INVALID");
  return {
    issuer: input.discovery.issuer,
    subject: payload.sub,
    email: payload.email.trim().toLocaleLowerCase("en-US"),
  };
}

export async function bindOidcIdentityAndCreateSession(input: {
  issuer: string;
  subject: string;
  email: string;
  requestId: string;
  metadata?: RequestMetadata;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.oidcIdentity.findUnique({
      where: { issuer_subject: { issuer: input.issuer, subject: input.subject } },
      include: { user: true },
    });
    let user = existing?.user;
    let newlyBound = false;
    if (!user) {
      user = await tx.user.findUnique({ where: { email: input.email } }) ?? undefined;
      if (!user) throw new Error("OIDC_ACCOUNT_NOT_PROVISIONED");
      const issuerConflict = await tx.oidcIdentity.findUnique({
        where: { userId_issuer: { userId: user.id, issuer: input.issuer } },
      });
      if (issuerConflict) throw new Error("OIDC_IDENTITY_CONFLICT");
      await tx.oidcIdentity.create({
        data: { userId: user.id, issuer: input.issuer, subject: input.subject },
      });
      await writeAuditLog(tx, {
        eventId: user.eventId,
        actorUserId: user.id,
        requestId: input.requestId,
        metadata: input.metadata,
        change: {
          action: "OIDC_IDENTITY_BOUND",
          targetType: "USER",
          targetId: user.id,
          summary: "Pre-provisioned account bound to OIDC identity",
          after: { issuer: createHash("sha256").update(input.issuer).digest("hex"), bound: true },
        },
      });
      newlyBound = true;
    }
    if (user.status !== "ACTIVE") throw new Error("OIDC_ACCOUNT_ARCHIVED");
    await tx.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        ...(newlyBound && !user.issuer && !user.externalSubject
          ? { issuer: input.issuer, externalSubject: input.subject }
          : {}),
      },
    });
    const session = await createFormalSessionInTransaction(tx, user.id, input.metadata);
    return {
      ...session,
      account: {
        id: user.id,
        eventId: user.eventId,
        accountCode: user.accountCode,
        displayName: user.displayName,
        role: user.role,
        protectedSystemAdmin: user.protectedSystemAdmin,
      },
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
