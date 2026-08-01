"use client";

import Link from "next/link";
import { useEffect } from "react";
import { activateUiPreview, deactivateUiPreview } from "@/lib/preview/ui-preview";

const studentPages = [
  ["Home", "/home"],
  ["Day 1 · It’s Me", "/me/day-1"],
  ["Day 3 · Little Bottles", "/me/day-3"],
  ["Browse", "/browse?section=day1"],
  ["Artwork", "/artworks/preview-artwork?section=day1"],
] as const;

const adminPages = [
  ["Admin Dashboard", "/admin"],
  ["Admin Accounts", "/admin/accounts"],
  ["Admin Audit", "/admin/audit"],
] as const;

export default function PreviewLauncher({ exit = false }: { exit?: boolean }) {
  useEffect(() => {
    if (exit) deactivateUiPreview();
    else activateUiPreview();
  }, [exit]);

  if (exit) return <main className="ow-phone flex min-h-svh items-center"><section className="student-state-card w-full"><p className="ow-kicker">UI PREVIEW</p><h1 className="ow-heading mt-3">预览模式已退出。</h1><Link className="ow-btn mt-8" href="/login">返回登录页</Link></section></main>;

  return (
    <main className="ow-phone ow-enter">
      <header><p className="ow-kicker">LOCAL DEVELOPMENT ONLY</p><h1 className="ow-heading mt-2">UI PREVIEW</h1><p className="ow-muted mt-4">展示数据只保存在浏览器当前标签页，不会登录、请求数据库、上传图片或保存修改。</p></header>
      <section className="mt-10"><h2 className="text-xl font-black">STUDENT</h2><div className="mt-4 grid gap-3">{studentPages.map(([label, href]) => <Link key={href} href={href} className="ow-btn ow-btn-outline !w-full text-left">{label}<span className="float-right">→</span></Link>)}</div></section>
      <section className="mt-10"><h2 className="text-xl font-black">ADMIN</h2><div className="mt-4 grid gap-3">{adminPages.map(([label, href]) => <Link key={href} href={href} className="ow-btn ow-btn-outline !w-full text-left">{label}<span className="float-right">→</span></Link>)}</div></section>
      <Link href="/_preview?exit=1" className="mt-10 inline-block min-h-11 font-bold underline">退出预览模式</Link>
    </main>
  );
}
