import { createHmac } from "node:crypto";

export interface RequestMetadata {
  ipHash?: string;
  userAgentHash?: string;
}

function getDigestSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) throw new Error("Missing required environment variable: SESSION_SECRET");
  return secret;
}

export function digestSensitive(value: string): string {
  return createHmac("sha256", getDigestSecret()).update(value).digest("hex");
}

export function getRequestMetadata(request: Request): RequestMetadata {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim();
  const userAgent = request.headers.get("user-agent")?.trim();
  return {
    ...(ip && { ipHash: digestSensitive(ip) }),
    ...(userAgent && { userAgentHash: digestSensitive(userAgent) }),
  };
}

export function hasTrustedWriteOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";

  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) {
    try {
      const configuredOrigin = new URL(configured).origin;
      const requestOrigin = new URL(request.url).origin;
      return origin === requestOrigin || origin === configuredOrigin;
    } catch {
      return false;
    }
  }

  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
