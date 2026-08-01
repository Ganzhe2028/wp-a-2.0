import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { hashLocalPassword, verifyLocalPassword } from "@/lib/server/passwords";
import { getFormalSession } from "@/lib/server/formal-session";

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getAdminPassword(): string {
  return getRequiredEnv("ADMIN_PASSWORD");
}

function getAdminSecret(): Uint8Array {
  return new TextEncoder().encode(getAdminPassword());
}

const COOKIE_NAME = "owk_admin";
const COOKIE_MAX_AGE = 60 * 60 * 8;

export async function createAdminSession(
  password: string
): Promise<string | null> {
  if (process.env.ALLOW_LEGACY_ADMIN_PASSWORD !== "true") return null;
  if (password !== getAdminPassword()) return null;

  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getAdminSecret());
}

export async function verifyAdminSession(): Promise<boolean> {
  const formal = await getFormalSession();
  if (formal?.role === "ADMIN") return true;
  if (process.env.ALLOW_LEGACY_ADMIN_PASSWORD !== "true") return false;

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return false;

  try {
    await jwtVerify(token, getAdminSecret());
    return true;
  } catch {
    return false;
  }
}

export function setAdminCookie(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
}

export function clearAdminCookie() {
  return {
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    path: "/",
    maxAge: 0,
  };
}

export async function verifyEditToken(
  token: string
): Promise<{ id: string } | null> {
  const person = await prisma.person.findUnique({
    where: { editToken: token },
    select: { id: true },
  });
  return person ?? null;
}

// ── Password Hashing (node:crypto scrypt) ──

export function hashPassword(plain: string): string {
  return hashLocalPassword(plain);
}

export function verifyPassword(plain: string, stored: string): boolean {
  return verifyLocalPassword(plain, stored);
}

// ── Student Session (JWT, httpOnly cookie, 14d) ──

function getSessionSecret(): Uint8Array {
  return new TextEncoder().encode(getRequiredEnv("SESSION_SECRET"));
}

const SESSION_COOKIE = "owk_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 14; // 14 days

export async function createStudentSession(personId: string): Promise<string> {
  return new SignJWT({ pid: personId, role: "student" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(getSessionSecret());
}

export async function verifyStudentSession(): Promise<{ personId: string; userId?: string } | null> {
  const formal = await getFormalSession();
  if (formal && formal.role !== "ADMIN") {
    return { personId: formal.userId, userId: formal.userId };
  }
  if (process.env.ALLOW_LEGACY_STUDENT_PASSWORD !== "true") return null;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    return { personId: payload.pid as string };
  } catch {
    return null;
  }
}

export function setStudentCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

export function clearStudentCookie() {
  return {
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    path: "/",
    maxAge: 0,
  };
}
