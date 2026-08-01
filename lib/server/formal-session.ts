import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import type { UserRole } from "@/app/generated/prisma/enums";
import type { RequestMetadata } from "@/lib/server/request-security";

export const UNIFIED_SESSION_COOKIE = "owk_session";
const ABSOLUTE_SESSION_MS = 24 * 60 * 60 * 1000;
const IDLE_SESSION_MS = 8 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export interface FormalSessionUser {
  sessionId: string;
  userId: string;
  eventId: string;
  accountCode: string;
  displayName: string;
  role: UserRole;
  groupId: string | null;
  status: "ACTIVE";
  protectedSystemAdmin: boolean;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createFormalSession(userId: string, metadata: RequestMetadata = {}) {
  return createFormalSessionWithClient(prisma, userId, metadata);
}

export async function createFormalSessionInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  metadata: RequestMetadata = {},
) {
  return createFormalSessionWithClient(tx, userId, metadata);
}

async function createFormalSessionWithClient(
  client: Pick<Prisma.TransactionClient, "session">,
  userId: string,
  metadata: RequestMetadata,
) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ABSOLUTE_SESSION_MS);
  await client.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId,
      expiresAt,
      ipHash: metadata.ipHash,
      userAgentHash: metadata.userAgentHash,
    },
  });
  return { token, expiresAt };
}

export function setUnifiedSessionCookie(token: string, expiresAt: Date) {
  return {
    name: UNIFIED_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
    maxAge: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
  };
}

export function clearUnifiedSessionCookie() {
  return {
    name: UNIFIED_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}

export async function getFormalSessionFromToken(token: string): Promise<FormalSessionUser | null> {
  if (!token || token.includes(".")) return null;
  const now = new Date();
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      lastSeenAt: true,
      user: {
        select: {
          id: true,
          eventId: true,
          accountCode: true,
          displayName: true,
          role: true,
          groupId: true,
          status: true,
          protectedSystemAdmin: true,
        },
      },
    },
  });
  if (!session || session.revokedAt || session.expiresAt <= now || session.user.status !== "ACTIVE") {
    return null;
  }
  if (now.getTime() - session.lastSeenAt.getTime() > IDLE_SESSION_MS) {
    await prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: now },
    });
    return null;
  }
  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  }
  return {
    sessionId: session.id,
    userId: session.user.id,
    eventId: session.user.eventId,
    accountCode: session.user.accountCode,
    displayName: session.user.displayName,
    role: session.user.role,
    groupId: session.user.groupId,
    status: "ACTIVE",
    protectedSystemAdmin: session.user.protectedSystemAdmin,
  };
}

export async function getFormalSession(): Promise<FormalSessionUser | null> {
  const store = await cookies();
  return getFormalSessionFromToken(store.get(UNIFIED_SESSION_COOKIE)?.value ?? "");
}

export async function revokeFormalSessionToken(token: string): Promise<void> {
  if (!token || token.includes(".")) return;
  await prisma.session.updateMany({
    where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeCurrentFormalSession(): Promise<void> {
  const store = await cookies();
  await revokeFormalSessionToken(store.get(UNIFIED_SESSION_COOKIE)?.value ?? "");
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
