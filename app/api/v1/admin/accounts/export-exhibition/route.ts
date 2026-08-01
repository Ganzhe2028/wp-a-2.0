import { NextResponse } from "next/server";
import { csvRow } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { requireFormalAdmin } from "@/lib/server/admin-request";

export async function GET() {
  const context = await requireFormalAdmin();
  if (!context.ok) return context.response;
  const baseUrl = (process.env.APP_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
  const accounts = await prisma.user.findMany({
    where: { eventId: context.admin.eventId, status: "ACTIVE" },
    orderBy: [{ role: "asc" }, { displayNameSortKey: "asc" }, { id: "asc" }],
    select: {
      displayName: true,
      accountCode: true,
      role: true,
      group: { select: { name: true } },
      artworkPublicIds: { where: { revokedAt: null }, orderBy: { createdAt: "asc" }, select: { publicId: true }, take: 1 },
    },
  });
  const header = csvRow(["displayName", "accountCode", "role", "groupName", "exhibitionUrl"]);
  const rows = accounts.map((account) => csvRow([
    account.displayName,
    account.accountCode,
    account.role,
    account.group?.name || "",
    account.artworkPublicIds[0]?.publicId ? `${baseUrl}/artworks/${encodeURIComponent(account.artworkPublicIds[0].publicId)}` : "",
  ]));
  return new NextResponse(`\uFEFF${[header, ...rows].join("\r\n")}`, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="oweek-nfc-exhibition-links.csv"',
    },
  });
}
