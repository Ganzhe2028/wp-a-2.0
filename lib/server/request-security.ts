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

// 客户端 IP 解析：优先平台提供的可信头（Vercel），其次 x-real-ip（可信代理设置），
// 最后取 X-Forwarded-For 最右条目（假定最后一跳是可信代理追加的）。
// 不信任客户端可伪造的首个 XFF 值。
export function clientIpAddress(request: Request): string {
  const vercel = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (vercel) return vercel;
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .at(-1);
  return forwarded ?? "";
}

export function getRequestMetadata(request: Request): RequestMetadata {
  const ip = clientIpAddress(request);
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
