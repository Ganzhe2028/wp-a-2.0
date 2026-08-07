import { prisma } from "@/lib/prisma";
import { clientIpAddress, digestSensitive } from "@/lib/server/request-security";

interface RateLimitRow {
  count: number;
  expiresAt: Date;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function clientRateLimitIdentity(request: Request): string {
  return clientIpAddress(request) || "unknown-client";
}

export async function consumePersistentRateLimit(input: {
  scope: string;
  identity: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  if (!/^[A-Z0-9_:-]{1,64}$/.test(input.scope) || !input.identity || input.limit < 1 || input.windowMs < 1_000) {
    throw new Error("RATE_LIMIT_CONFIGURATION_INVALID");
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.windowMs);
  const keyHash = digestSensitive(`${input.scope}\0${input.identity}`);
  const rows = await prisma.$queryRaw<RateLimitRow[]>`
    INSERT INTO "RateLimitBucket" ("keyHash", "scope", "count", "windowStartedAt", "expiresAt")
    VALUES (${keyHash}, ${input.scope}, 1, ${now}, ${expiresAt})
    ON CONFLICT ("keyHash") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "windowStartedAt" = CASE
        WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN ${now}
        ELSE "RateLimitBucket"."windowStartedAt"
      END,
      "expiresAt" = CASE
        WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN ${expiresAt}
        ELSE "RateLimitBucket"."expiresAt"
      END
    RETURNING "count", "expiresAt"
  `;
  const row = rows[0];
  if (!row) throw new Error("RATE_LIMIT_STORAGE_FAILED");
  return {
    allowed: row.count <= input.limit,
    retryAfterSeconds: Math.max(1, Math.ceil((new Date(row.expiresAt).getTime() - now.getTime()) / 1_000)),
  };
}
