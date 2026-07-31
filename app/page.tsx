import { verifyStudentSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "OWeek 个人主页",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await verifyStudentSession();
  if (session) {
    redirect("/me");
  }

  const { next } = await searchParams;
  const safeNext =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-stone-50 to-stone-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            OWeek 个人主页
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            登录后编辑你的主页，收藏你遇到的同学
          </p>
        </div>

        <LoginForm next={safeNext} />

        <p className="mt-8 text-center text-xs text-stone-400">
          <a href="/admin" className="underline hover:text-stone-600">
            管理员入口
          </a>
        </p>
      </div>
    </div>
  );
}
