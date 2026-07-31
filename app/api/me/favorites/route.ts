import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyStudentSession } from "@/lib/auth";

export async function GET() {
  const session = await verifyStudentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const favorites = await prisma.favorite.findMany({
    where: { favoriterId: session.personId },
    include: {
      favoritee: {
        select: {
          code: true,
          chineseName: true,
          englishName: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    favorites: favorites.map((f) => ({
      code: f.favoritee.code,
      chineseName: f.favoritee.chineseName,
      englishName: f.favoritee.englishName,
      avatarUrl: f.favoritee.avatarUrl,
      favoritedAt: f.createdAt,
    })),
  });
}