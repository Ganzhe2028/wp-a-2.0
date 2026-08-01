"use client";

import Link from "next/link";
import { useState } from "react";
import { describeApiError, safeReturnTo, studentApi } from "@/components/student/api";

const SSO_ERRORS: Record<string, string> = {
  unavailable: "学校统一登录尚未配置或暂时不可用。",
  cancelled: "学校统一登录已取消，请重试。",
  not_provisioned: "该学校邮箱尚未由管理员导入，无法登录。",
  archived: "该账号已归档，请联系管理员。",
  conflict: "该学校身份与现有账号存在冲突，请联系管理员。",
  failed: "学校统一登录验证失败，请重试或联系管理员。",
  rate_limited: "登录尝试过于频繁，请稍后再试。",
};

export default function LoginClient({
  returnTo,
  localEnabled,
  oidcEnabled,
  oidcReady,
  ssoError,
  returnToExplicit,
}: {
  returnTo: string;
  localEnabled: boolean;
  oidcEnabled: boolean;
  oidcReady: boolean;
  ssoError: string;
  returnToExplicit: boolean;
}) {
  const [accountCode, setAccountCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await studentApi<{ returnTo?: string; account?: { role?: string } }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ accountCode: accountCode.trim(), password, ...(returnToExplicit && { returnTo: safeReturnTo(returnTo) }) }),
      });
      const fallback = !returnToExplicit && data.account?.role === "ADMIN" ? "/admin" : returnTo;
      window.location.assign(safeReturnTo(data?.returnTo, fallback));
    } catch (caught) {
      setError(describeApiError(caught));
      setLoading(false);
    }
  }

  return (
    <main className="ow-phone flex flex-col ow-enter">
      <section className="pt-[7svh]" aria-labelledby="login-title">
        <p className="ow-kicker">O—WEEK / 26</p>
        <h1 id="login-title" className="ow-title mt-3" style={{ fontSize: "clamp(4.2rem, 20vw, 8rem)" }}>MEET.<br />SHARE.<br />FIND.</h1>
        <div className="mt-8 h-[2px] bg-black" />
      </section>
      <section className="mt-auto pt-12">
        <h2 className="ow-heading">从你的账号开始。</h2>
        <p className="ow-muted mt-3 leading-7">使用管理员预置的账号；系统不支持自行注册。</p>
        {(ssoError && SSO_ERRORS[ssoError]) && <p role="alert" className="mt-5 font-bold text-red-700">{SSO_ERRORS[ssoError]}</p>}
        {oidcEnabled && oidcReady && (
          <a className="ow-btn mt-8 block text-center" href={returnToExplicit ? `/api/v1/auth/oidc/start?returnTo=${encodeURIComponent(returnTo)}` : "/api/v1/auth/oidc/start"}>
            使用学校统一登录 →
          </a>
        )}
        {oidcEnabled && !oidcReady && <p role="alert" className="mt-8 font-bold text-red-700">学校统一登录尚未完成配置。</p>}
        {oidcEnabled && oidcReady && localEnabled && <p className="ow-muted my-5 text-center text-sm">或使用账号编号和密码</p>}
        {localEnabled && (
          <form onSubmit={submit} className={oidcEnabled && oidcReady ? "space-y-4" : "mt-8 space-y-4"}>
            <label className="student-field"><span>账号编号</span><input value={accountCode} onChange={(event) => setAccountCode(event.target.value)} autoComplete="username" inputMode="text" required /></label>
            <label className="student-field"><span>密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
            {error && <p role="alert" className="font-bold text-red-700">{error}</p>}
            <button type="submit" disabled={loading || !accountCode.trim() || !password} className="ow-btn">{loading ? "登录中…" : "进入 O—WEEK →"}</button>
          </form>
        )}
        <nav className="mt-5 flex justify-between text-sm font-bold" aria-label="登录帮助"><Link href="/privacy" className="ow-orange">隐私说明</Link><Link href="/help" className="ow-orange">需要帮助？</Link></nav>
      </section>
    </main>
  );
}
