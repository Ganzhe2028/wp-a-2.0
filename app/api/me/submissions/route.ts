import { NextRequest, NextResponse } from "next/server";
import { verifyStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseDay3Answers } from "@/lib/flow";
import { settingEnabled } from "@/lib/event-settings";

export async function GET() {
  const session = await verifyStudentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const person = await prisma.person.findUnique({ where: { id: session.personId }, select: { day1SubmittedAt: true, day3Answers: true, day3SubmittedAt: true } });
  return NextResponse.json({ day1SubmittedAt: person?.day1SubmittedAt ?? null, day3Answers: parseDay3Answers(person?.day3Answers), day3SubmittedAt: person?.day3SubmittedAt ?? null });
}

export async function PATCH(request: NextRequest) {
  const session = await verifyStudentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  const person = await prisma.person.findUnique({ where: { id: session.personId }, select: { avatarUrl: true, images: { where: { hidden: false } }, day1SubmittedAt: true, day3SubmittedAt: true } });
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "submitDay1") {
    if (!(await settingEnabled("day1Open"))) return NextResponse.json({ error: "DAY 1 is closed" }, { status: 403 });
    if (person.day1SubmittedAt) return NextResponse.json({ error: "DAY 1 is already submitted" }, { status: 409 });
    if (!person.avatarUrl || person.images.length < 14) return NextResponse.json({ error: "请先完成 15 / 15 个图片格" }, { status: 400 });
    const updated = await prisma.person.update({ where: { id: session.personId }, data: { day1SubmittedAt: new Date(), published: true }, select: { day1SubmittedAt: true } });
    return NextResponse.json({ ok: true, ...updated });
  }

  if (body.action === "saveDay3" || body.action === "submitDay3") {
    if (!(await settingEnabled("day3Open"))) return NextResponse.json({ error: "DAY 3 is closed" }, { status: 403 });
    if (person.day3SubmittedAt) return NextResponse.json({ error: "DAY 3 is already submitted" }, { status: 409 });
    const answers = parseDay3Answers(body.answers);
    const updated = await prisma.person.update({ where: { id: session.personId }, data: { day3Answers: answers, ...(body.action === "submitDay3" && { day3SubmittedAt: new Date() }) }, select: { day3Answers: true, day3SubmittedAt: true } });
    return NextResponse.json({ ok: true, ...updated });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}