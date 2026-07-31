"use client";

export default function SessionExpired() {
  const next = encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/home");
  return (
    <div className="rounded-[var(--radius-card)] border-2 border-[var(--line)] bg-[var(--paper)] p-8 text-center" role="alert">
      <b className="text-2xl">登录状态已过期，请重新登录</b>
      <p className="ow-muted mt-3 text-sm">401 · UNAUTHENTICATED</p>
      <a href={`/?next=${next}`} className="ow-btn mt-8">重新登录</a>
      <a href="/home" className="ow-btn ow-btn-outline mt-3">返回首页</a>
    </div>
  );
}
