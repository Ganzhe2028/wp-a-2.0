import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code, name, grade, room, seat } = await request.json();
  if (!code || !name || room === undefined || seat === undefined) {
    return NextResponse.json(
      { error: "code, name, room, seat required" },
      { status: 400 }
    );
  }

  const location = await prisma.locationCard.upsert({
    where: { code },
    update: { name, grade: grade || null, room, seat },
    create: {
      code,
      name,
      grade: grade || null,
      room,
      seat,
      person: {
        connect: { code },
      },
    },
  });

  return NextResponse.json({ ok: true, location });
}
