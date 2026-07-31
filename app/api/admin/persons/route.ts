import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const persons = await prisma.person.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      code: true,
      englishName: true,
      chineseName: true,
      grade: true,
      username: true,
      role: true,
      groupName: true,
      day1SubmittedAt: true,
      day3SubmittedAt: true,
      updatedAt: true,
      hidden: true,
      published: true,
      images: {
        orderBy: { sort: "asc" },
        select: {
          id: true,
          url: true,
          hidden: true,
          sort: true,
        },
      },
    },
  });

  return NextResponse.json({ persons });
}

export async function PATCH(request: NextRequest) {
  if (!(await verifyAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  if (typeof body.id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 });
  const role = body.role === "SENIOR" || body.role === "ADMIN" ? body.role : "LEARNER";
  const chineseName = typeof body.chineseName === "string" ? body.chineseName.trim().slice(0, 40) : undefined;
  const groupName = typeof body.groupName === "string" ? body.groupName.trim().slice(0, 40) || null : undefined;
  const person = await prisma.person.update({ where: { id: body.id }, data: { role, ...(chineseName !== undefined && { chineseName }), ...(groupName !== undefined && { groupName }) }, select: { id: true, chineseName: true, role: true, groupName: true } });
  return NextResponse.json({ ok: true, person });
}

export async function DELETE(request: NextRequest) {
  if (!(await verifyAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.person.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
