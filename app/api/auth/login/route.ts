import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  createStudentSession,
  setStudentCookie,
} from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_IP_ATTEMPTS = 20;
const MAX_USER_ATTEMPTS = 5;

export async function POST(request: NextRequest) {
  if (process.env.ALLOW_LEGACY_STUDENT_PASSWORD !== "true") {
    return NextResponse.json(
      { error: "旧账号入口已停用，请使用 /api/v1/auth/login" },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() ?? "unknown";

  if (!checkRateLimit(`login:ip:${ip}`, MAX_IP_ATTEMPTS, WINDOW_MS)) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 }
    );
  }

  let username: string;
  let password: string;
  try {
    const body = await request.json();
    username = body.username;
    password = body.password;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  if (!username || !password) {
    return NextResponse.json(
      { error: "username and password required" },
      { status: 400 }
    );
  }

  if (!checkRateLimit(`login:user:${username}`, MAX_USER_ATTEMPTS, WINDOW_MS)) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 }
    );
  }

  const person = await prisma.person.findUnique({
    where: { username },
    select: { id: true, passwordHash: true },
  });

  if (
    !person ||
    !person.passwordHash ||
    !verifyPassword(password, person.passwordHash)
  ) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 }
    );
  }

  const sessionToken = await createStudentSession(person.id);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(setStudentCookie(sessionToken));
  return response;
}
