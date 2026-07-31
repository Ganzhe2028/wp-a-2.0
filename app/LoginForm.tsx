"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "登录失败，请检查学校账号");
        return;
      }
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/home");
      router.refresh();
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-3">
      <label className="block"><span className="sr-only">学校账号</span><input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="学校账号" className="min-h-12 w-full border-2 border-black px-4 text-base" required /></label>
      <label className="block"><span className="sr-only">密码</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="密码" className="min-h-12 w-full border-2 border-black px-4 text-base" required /></label>
      {error && <p role="alert" className="font-bold text-red-600">{error}</p>}
      <button className="ow-btn" disabled={loading || !username || !password}>{loading ? "登录中…" : <>使用学校账号登录 <span aria-hidden="true">→</span></>}</button>
    </form>
  );
}
