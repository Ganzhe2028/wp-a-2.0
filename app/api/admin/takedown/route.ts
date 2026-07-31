import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type, id, hidden } = await request.json();
  if (!type || !id || hidden === undefined) {
    return NextResponse.json(
      { error: "type, id, hidden required" },
      { status: 400 }
    );
  }

  if (type === "person") {
    await prisma.person.update({ where: { id }, data: { hidden } });
  } else if (type === "image") {
    await prisma.image.update({ where: { id }, data: { hidden } });
  } else {
    return NextResponse.json({ error: "type must be person or image" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
