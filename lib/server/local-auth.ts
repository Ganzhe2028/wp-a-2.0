import { prisma } from "@/lib/prisma";
import { ensureProtectedAdmin } from "@/lib/server/bootstrap";
import { normalizeAccountCode } from "@/lib/server/formal-identifiers";
import { verifyLocalPassword } from "@/lib/server/passwords";
import { createFormalSession } from "@/lib/server/formal-session";
import { localLoginEnabled } from "@/lib/server/auth-mode";
import type { RequestMetadata } from "@/lib/server/request-security";

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
        role: "LEARNER" | "SENIOR" | "COUNSELOR" | "ADMIN";
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
  await ensureProtectedAdmin();

  const accountCode = normalizeAccountCode(input.accountCode);
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

  if (!user?.localCredential || !verifyLocalPassword(input.password, user.localCredential.passwordHash)) {
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
