import { verifyStudentSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "O-Week" };

export default async function HomePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await verifyStudentSession();
  if (session) redirect("/home");

  const { next } = await searchParams;
  const safeNext = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : null;

  return (
    <main className="ow-phone flex flex-col ow-enter">
      <div className="pt-[7svh]">
        <h1 className="ow-title" style={{ fontSize: "clamp(4.2rem, 20vw, 8rem)" }}>O—WEEK</h1>
        <p className="ow-kicker mt-2 text-lg">MEET / SHARE / FIND</p>
        <div className="mt-8 h-[2px] bg-black" />
        <div className="mt-8 grid h-64 grid-cols-[1.2fr_.75fr_1fr] grid-rows-2 gap-2" aria-hidden="true">
          <div className="bg-black p-4 text-3xl font-black leading-[.9] text-white">WHO<br />ARE<br />YOU?</div>
          <div className="ow-card col-span-2" />
          <div className="ow-card" />
          <div className="col-span-2 bg-black p-4 text-2xl font-black text-white">EVERYTHING<br />IS A PROFILE.</div>
        </div>
      </div>
      <section className="mt-auto pt-10">
        <h2 className="ow-heading max-w-xl">认识彼此，从一份资料开始。</h2>
        <p className="ow-muted mt-3 leading-7">使用学校账号登录后，填写并交换你的 Day 1 / Day 3 资料。</p>
        <LoginForm next={safeNext} />
        <div className="mt-5 flex justify-between text-sm font-bold ow-orange"><span>隐私说明</span><span>需要帮助？</span></div>
      </section>
    </main>
  );
}
