import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateQRCodeSVG } from "@/lib/qr";

export async function GET() {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
  const persons = await prisma.person.findMany({
    orderBy: { createdAt: "asc" },
    select: { chineseName: true, code: true },
  });

  type QRItem = {
    chineseName: string | null;
    code: string;
    type: "u" | "loc";
    svg: string;
    url: string;
  };

  const items: QRItem[] = [];

  for (const p of persons) {
    const urlU = `${baseUrl}/u/${p.code}`;
    const urlLoc = `${baseUrl}/loc/${p.code}`;

    const [svgU, svgLoc] = await Promise.all([
      generateQRCodeSVG(urlU, 200),
      generateQRCodeSVG(urlLoc, 200),
    ]);

    items.push(
      { chineseName: p.chineseName, code: p.code, type: "u", svg: svgU, url: urlU },
      { chineseName: p.chineseName, code: p.code, type: "loc", svg: svgLoc, url: urlLoc },
    );
  }

  const cards = items
    .map(
      ({ chineseName, code, type, svg, url }) => `
    <div class="card">
      <div class="qr">${svg}</div>
      <div class="label">
        <span class="name">${escapeHtml(chineseName ?? code)}</span>
        <span class="code">${escapeHtml(code)}</span>
        <span class="type">${type === "u" ? "主页" : "位置页"}</span>
        <span class="url">${escapeHtml(url)}</span>
      </div>
    </div>`,
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>OWeek QR 码 — 批量打印</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    background: #fff;
    color: #111;
    padding: 0;
  }
  .header {
    text-align: center;
    padding: 16px 0 8px;
    border-bottom: 1px dashed #ccc;
    margin-bottom: 12px;
  }
  .header h1 { font-size: 18px; font-weight: 600; }
  .header p { font-size: 12px; color: #888; margin-top: 2px; }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    padding: 0 8px;
  }
  .card {
    break-inside: avoid;
    page-break-inside: avoid;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    padding: 8px;
    text-align: center;
  }
  .qr {
    width: 100%;
    max-width: 140px;
    margin: 0 auto;
  }
  .qr svg {
    display: block;
    width: 100%;
    height: auto;
  }
  .label {
    margin-top: 4px;
    font-size: 11px;
    line-height: 1.5;
  }
  .label .name {
    display: block;
    font-weight: 600;
    font-size: 13px;
  }
  .label .code {
    display: block;
    font-family: monospace;
    color: #666;
  }
  .label .type {
    display: inline-block;
    margin-top: 1px;
    padding: 0 4px;
    border-radius: 3px;
    font-size: 10px;
    background: #f0f0f0;
    color: #555;
  }
  .label .url {
    display: block;
    font-size: 9px;
    color: #aaa;
    word-break: break-all;
    margin-top: 2px;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .header { border-bottom-color: #ccc; }
    .card { border-color: #ddd; }
    @page { size: A4; margin: 4mm; }
    .grid {
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
      padding: 0;
    }
    .card { padding: 4px; border-radius: 2px; }
    .qr { max-width: 120px; }
    .label { font-size: 10px; }
    .label .name { font-size: 11px; }
    .label .url { display: none; }
  }
</style>
</head>
<body>
  <div class="header">
    <h1>OWeek QR 码</h1>
    <p>${persons.length} 人 · ${items.length} 张 QR 码 · 共 ${Math.ceil(items.length / 8)} 页（约）</p>
  </div>
  <div class="grid">
    ${cards}
  </div>
  <script>window.print();</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
