"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { studentApi } from "./api";

export default function StudentHeader({ title, backHref = "/home", showLogout = false }: { title: string; backHref?: string; showLogout?: boolean }) {
  const router = useRouter();

  async function logout() {
    try { await studentApi("/api/v1/auth/logout", { method: "POST" }); } catch { /* Cookie clearing is best effort. */ }
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="ow-nav">
      <Link href={backHref} aria-label="返回" className="ow-orange text-4xl leading-none">←</Link>
      <strong className="text-lg tracking-tight">{title}</strong>
      {showLogout ? <button type="button" onClick={logout} className="ow-nav-action">退出</button> : <span />}
    </header>
  );
}
