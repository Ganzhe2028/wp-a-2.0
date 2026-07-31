"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function getIsWeChat(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /MicroMessenger/i.test(navigator.userAgent)
  );
}

export default function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isWeChat] = useState(getIsWeChat);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "登录失败，请检查用户名和密码");
        return;
      }

      if (next && isValidNext(next)) {
        router.push(next);
      } else {
        router.push("/me");
      }
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl bg-white p-6 shadow-sm"
    >
      {isWeChat && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">请用系统浏览器打开</p>
          <p className="mt-1">
            微信内置浏览器与 Safari 不共享登录状态。请点击右上角「⋯」，选择「在
            Safari/默认浏览器中打开」，否则碰 NFC 后可能需要重新登录。
          </p>
        </div>
      )}

      <div className="mb-4">
        <label
          htmlFor="username"
          className="mb-1.5 block text-sm font-medium text-stone-700"
        >
          用户名
        </label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="输入你的用户名（印在纸条上）"
          required
          className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 transition-all focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
      </div>

      <div className="mb-4">
        <label
          htmlFor="password"
          className="mb-1.5 block text-sm font-medium text-stone-700"
        >
          密码
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="输入你的密码（印在纸条上）"
          required
          className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 transition-all focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
      </div>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={loading || !username || !password}
        className="w-full rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-teal-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "登录中…" : "登录"}
      </button>
    </form>
  );
}

function isValidNext(next: string): boolean {
  if (typeof next !== "string") return false;
  return next.startsWith("/") && !next.startsWith("//");
}
