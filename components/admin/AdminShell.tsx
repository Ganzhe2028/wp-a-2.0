"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { adminApi, AdminApiError, authApi, type AdminIdentity } from "./admin-api";

const NAV = [
  { href: "/admin", label: "DASHBOARD" },
  { href: "/admin/accounts", label: "ACCOUNTS" },
  { href: "/admin/audit", label: "AUDIT LOG" },
];

interface AuthMethods { localEnabled: boolean; oidcEnabled: boolean; oidcReady: boolean }

function Login({ onLogin, methods }: { onLogin: (identity: AdminIdentity) => void; methods: AuthMethods }) {
  const [accountCode, setAccountCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await adminApi<{ account: AdminIdentity }>("/login", {
        method: "POST",
        body: JSON.stringify({ accountCode: accountCode.trim(), password }),
      });
      onLogin(result.account);
    } catch (cause) {
      setError(cause instanceof AdminApiError ? cause.message : "暂时无法登录，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-[var(--paper)] p-5">
      <form onSubmit={submit} className="w-full max-w-md border-[1.5px] border-black bg-white p-7 shadow-[12px_12px_0_#ff5311] sm:p-10">
        <p className="text-xs font-black tracking-[.16em] text-[var(--orange)]">CONTROL ROOM / 2026</p>
        <h1 className="mt-3 text-4xl font-black tracking-[-.06em]">O—WEEK ADMIN</h1>
        <p className="mt-4 text-sm leading-6 text-neutral-600">管理员与参与者使用同一套账号体系；权限由服务端角色校验。</p>
        {methods.oidcEnabled && methods.oidcReady && <a href="/api/v1/auth/oidc/start?returnTo=%2Fadmin" className="ow-btn mt-8 block text-center">使用学校统一登录 →</a>}
        {methods.oidcEnabled && !methods.oidcReady && <p role="alert" className="mt-6 border-l-4 border-red-600 bg-red-50 p-3 text-sm font-bold text-red-700">学校统一登录尚未完成配置。</p>}
        {methods.localEnabled && <>
          {methods.oidcEnabled && methods.oidcReady && <p className="my-5 text-center text-xs font-bold text-neutral-500">或使用管理员账号编号和密码</p>}
          <label className={methods.oidcEnabled && methods.oidcReady ? "block text-sm font-black" : "mt-8 block text-sm font-black"}>账号编号
            <input value={accountCode} onChange={(event) => setAccountCode(event.target.value)} autoComplete="username" className="mt-2 min-h-12 w-full border-[1.5px] border-black px-4" placeholder="OWK-XXXXXX" required />
          </label>
          <label className="mt-5 block text-sm font-black">密码
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="mt-2 min-h-12 w-full border-[1.5px] border-black px-4" required />
          </label>
          {error && <p role="alert" className="mt-4 border-l-4 border-red-600 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
          <button disabled={loading || !accountCode.trim() || !password} className="ow-btn mt-7">{loading ? "验证中…" : "登录后台 →"}</button>
        </>}
      </form>
    </main>
  );
}

export default function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [methods, setMethods] = useState<AuthMethods>({ localEnabled: true, oidcEnabled: false, oidcReady: false });

  useEffect(() => {
    Promise.allSettled([
      adminApi<{ authed: boolean; account: AdminIdentity | null }>("/session"),
      authApi<AuthMethods>("/methods"),
    ]).then(([sessionResult, methodsResult]) => {
      setIdentity(sessionResult.status === "fulfilled" && sessionResult.value.authed ? sessionResult.value.account : null);
      if (methodsResult.status === "fulfilled") setMethods(methodsResult.value);
    }).finally(() => setChecking(false));
  }, []);

  async function logout() {
    try {
      await adminApi("/logout", { method: "POST" });
    } finally {
      setIdentity(null);
      router.replace("/admin");
    }
  }

  if (checking) return <div className="flex min-h-svh items-center justify-center bg-[var(--paper)] font-black">正在验证会话…</div>;
  if (!identity) return <Login onLogin={setIdentity} methods={methods} />;

  return (
    <div className="min-h-svh bg-[var(--paper)] lg:grid lg:grid-cols-[210px_minmax(0,1fr)]">
      <aside className="bg-[#0b0b0a] p-5 text-white lg:sticky lg:top-0 lg:flex lg:h-svh lg:flex-col lg:p-7">
        <Link href="/admin" className="text-3xl font-black leading-[.85] tracking-[-.07em]">O—WEEK<br /><span className="text-[var(--orange)]">CONTROL</span></Link>
        <nav aria-label="后台导航" className="mt-8 flex gap-2 overflow-x-auto lg:mt-14 lg:flex-col">
          {NAV.map((item) => {
            const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
            return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`min-h-11 whitespace-nowrap border-l-4 px-3 py-3 text-xs font-black tracking-[.08em] ${active ? "border-[var(--orange)] bg-white/10 text-white" : "border-transparent text-neutral-400 hover:text-white"}`}>{item.label}</Link>;
          })}
        </nav>
        <div className="mt-5 border-t border-white/20 pt-5 lg:mt-auto">
          <p className="truncate text-sm font-black">{identity.displayName}</p>
          <p className="mt-1 truncate font-mono text-[11px] text-neutral-400">{identity.accountCode}</p>
          <button onClick={() => void logout()} className="mt-4 min-h-11 text-xs font-black text-[var(--orange)]">退出登录 →</button>
        </div>
      </aside>
      <main className="min-w-0">
        <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-neutral-300 bg-white px-5 py-4 sm:px-8">
          <div><p className="text-[10px] font-black tracking-[.18em] text-neutral-500">ADMIN / O—WEEK 2026</p><h1 className="mt-1 text-3xl font-black tracking-[-.05em]">{title}</h1></div>
          <a href="/home" target="_blank" rel="noreferrer" className="border-[1.5px] border-black px-4 py-3 text-xs font-black">预览前台 ↗</a>
        </header>
        {children}
      </main>
    </div>
  );
}
