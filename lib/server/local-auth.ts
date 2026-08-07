import { prisma } from "@/lib/prisma";
import { ensureProtectedAdmin } from "@/lib/server/bootstrap";
import { normalizeAccountCode } from "@/lib/server/formal-identifiers";
import { verifyLocalPassword } from "@/lib/server/passwords";
import { createFormalSession } from "@/lib/server/formal-session";
import { localLoginEnabled } from "@/lib/server/auth-mode";
import type { RequestMetadata } from "@/lib/server/request-security";

// 预生成的固定 dummy hash：账号不存在时也执行等价 scrypt 验证，抹平登录时序差异
const DUMMY_LOCAL_PASSWORD_HASH = "scrypt-v1:a544c395eb12bff21aa5ac82fd434807:766e8422d52135cbf044b559e1369cc4011575105dbed3970ed77ec379f94cce9cf2e5b8b2c40c0ffe3e08b8dd46e673f3cec2b21670df53ac7cd52065337ff5";

export type LocalAuthFailure =
  | "LOCAL_LOGIN_DISABLED"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_ARCHIVED"
  | "FORBIDDEN";

export type LocalAuthResult =
  | { ok: false; reason: LocalAuthFailure }
  | {
      ok: true;
      token: string;
      expiresAt: Date;
      account: {
        id: string;
        eventId: string;
        accountCode: string;
        displayName: string;
        role: "LEARNER" | "SENIOR" | "ADMIN";
        protectedSystemAdmin: boolean;
      };
    };

export async function authenticateLocalAccount(input: {
  accountCode: string;
  password: string;
  requiredRole?: "ADMIN";
  metadata?: RequestMetadata;
}): Promise<LocalAuthResult> {
  if (!localLoginEnabled()) return { ok: false, reason: "LOCAL_LOGIN_DISABLED" };
  const accountCode = normalizeAccountCode(input.accountCode);
  if (accountCode === "SophiaXu") await ensureProtectedAdmin();
  const user = await prisma.user.findUnique({
    where: { accountCode },
    select: {
      id: true,
      eventId: true,
      accountCode: true,
      displayName: true,
      role: true,
      status: true,
      protectedSystemAdmin: true,
      localCredential: { select: { passwordHash: true } },
    },
  });

  // 无论账号是否存在都执行一次 scrypt 验证，使响应耗时与账号存在性无关
  const storedHash = user?.localCredential?.passwordHash ?? DUMMY_LOCAL_PASSWORD_HASH;
  const verified = verifyLocalPassword(input.password, storedHash);
  if (!user?.localCredential || !verified) {
    return { ok: false, reason: "INVALID_CREDENTIALS" };
  }
  if (user.status !== "ACTIVE") return { ok: false, reason: "ACCOUNT_ARCHIVED" };
  if (input.requiredRole && user.role !== input.requiredRole) {
    return { ok: false, reason: "FORBIDDEN" };
  }

  const [{ token, expiresAt }] = await Promise.all([
    createFormalSession(user.id, input.metadata),
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
  ]);
  return {
    ok: true,
    token,
    expiresAt,
    account: {
      id: user.id,
      eventId: user.eventId,
      accountCode: user.accountCode,
      displayName: user.displayName,
      role: user.role,
      protectedSystemAdmin: user.protectedSystemAdmin,
    },
  };
}
