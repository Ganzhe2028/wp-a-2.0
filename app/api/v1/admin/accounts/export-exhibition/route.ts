import { NextResponse } from "next/server";
import { failure } from "@/lib/contracts";
import { csvRow } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { requireFormalAdmin } from "@/lib/server/admin-request";

export async function POST(request: Request) {
  const context = await requireFormalAdmin(request, { write: true });
  if (!context.ok) return context.response;
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(failure("VALIDATION_ERROR", "请求格式无效", context.requestId), { status: 400 });
  }
  const rawAccountIds = body.accountIds;
  if (
    !Array.isArray(rawAccountIds) ||
    rawAccountIds.length < 1 ||
    rawAccountIds.length > 500 ||
    rawAccountIds.some((id) => typeof id !== "string" || !id.trim())
  ) {
    return NextResponse.json(failure("VALIDATION_ERROR", "请选择 1–500 个账号", context.requestId), { status: 400 });
  }
  const accountIds = rawAccountIds.map((id) => (id as string).trim());
  if (new Set(accountIds).size !== accountIds.length) {
    return NextResponse.json(failure("VALIDATION_ERROR", "账号选择中存在重复项", context.requestId), { status: 400 });
  }
  const baseUrl = (process.env.APP_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
  const accounts = await prisma.user.findMany({
    where: { id: { in: accountIds }, eventId: context.admin.eventId, status: "ACTIVE" },
    orderBy: [{ role: "asc" }, { displayNameSortKey: "asc" }, { id: "asc" }],
    select: {
      displayName: true,
      accountCode: true,
      role: true,
      group: { select: { name: true } },
      artworkPublicIds: { where: { revokedAt: null }, orderBy: { createdAt: "asc" }, select: { publicId: true }, take: 1 },
    },
  });
  if (accounts.length !== accountIds.length) {
    return NextResponse.json(failure("VALIDATION_ERROR", "所选账号包含不存在或已归档账号", context.requestId), { status: 400 });
  }
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
      "X-Request-Id": context.requestId,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="oweek-nfc-exhibition-links.csv"',
    },
  });
}
