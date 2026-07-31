import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyStudentSession } from "@/lib/auth";
import LogoutButton from "@/app/me/LogoutButton";
import { settingEnabled } from "@/lib/event-settings";

export default async function AppHome() {
  const session = await verifyStudentSession();
  if (!session) redirect("/?next=/home");
  const [person, day1Open, day3Open, navEnabled] = await Promise.all([
    prisma.person.findUnique({ where: { id: session.personId }, select: { chineseName: true, englishName: true, username: true, avatarUrl: true, images: { where: { hidden: false }, take: 1, select: { id: true } }, day1SubmittedAt: true, day3Answers: true, day3SubmittedAt: true } }),
    settingEnabled("day1Open"), settingEnabled("day3Open"), settingEnabled("navEnabled"),
  ]);
  if (!person) redirect("/");
  const name = person.chineseName || person.englishName || person.username;
  const day3Progress = Array.isArray(person.day3Answers) ? (person.day3Answers as unknown[][]).flat().filter((value) => typeof value === "number" && value > 0).length : 0;
  const day1Started = Boolean(person.avatarUrl || person.images.length > 0);
  const day1Action = person.day1SubmittedAt ? "查看资料" : day1Started ? "继续填写" : "开始填写";
  const day3Action = person.day3SubmittedAt ? "查看资料" : day3Progress > 0 ? "继续填写" : "开始填写";
  const browseUnlocked = Boolean(person.day1SubmittedAt || person.day3SubmittedAt);

  return (
    <main className="ow-phone ow-enter">
      <header className="ow-nav"><span /><strong>HOME</strong><div className="flex items-center gap-3"><LogoutButton /></div></header>
      <p className="ow-kicker text-2xl">HELLO,</p>
      <h1 className="ow-title mt-2 break-all">{name}</h1>
      <h2 className="ow-heading mt-10">今天想做什么？</h2>
      <div className="mt-8 space-y-4">
        <Link href={day1Open ? "/day1" : "/home"} aria-disabled={!day1Open} className={`ow-card block min-h-36 p-5 ${!day1Open ? "opacity-40" : ""}`}><div className="flex items-center justify-between"><b className="ow-muted">01</b><span className="ow-chip text-sm">{!day1Open ? "未开放" : day1Action}</span></div><div className="mt-4 text-5xl font-black">DAY 1</div><p className="ow-muted mt-2">照片拼贴 · {person.day1SubmittedAt ? "已提交" : "未提交"}</p><div className="ow-arrow ow-orange text-right text-4xl">→</div></Link>
        <Link href={day3Open ? "/day3" : "/home"} aria-disabled={!day3Open} className={`block min-h-36 rounded-[var(--radius-card)] border-2 border-[var(--orange)] bg-[var(--orange)] p-5 ${!day3Open ? "opacity-40" : ""}`}><div className="flex items-center justify-between font-bold"><b>03</b><span className="ow-chip ow-chip-white text-sm">{!day3Open ? "未开放" : day3Action}</span></div><div className="mt-4 text-5xl font-black">DAY 3</div><p className="mt-2">小瓶子 · {day3Progress} / 64</p><div className="ow-arrow text-right text-4xl">→</div></Link>
        <Link href={navEnabled ? (browseUnlocked ? "/browse" : "/browse?gate=1") : "/home"} aria-disabled={!navEnabled} className={`ow-card block min-h-36 p-5 ${!navEnabled ? "opacity-40" : ""}`}><div className="flex items-center justify-between"><b className="ow-arrow ow-muted">↗</b><span className="ow-chip text-sm">{!navEnabled ? "未开放" : browseUnlocked ? "已解锁" : "未解锁"}</span></div><div className="mt-4 text-5xl font-black">BROWSE</div><p className="ow-muted mt-2">浏览 Senior Group 与 Learners</p><div className="ow-arrow ow-orange text-right text-4xl">→</div></Link>
      </div>
      <div className="mt-7 flex justify-between font-bold"><span>完成任一部分即可解锁</span><Link href="/browse" className="ow-orange">查看规则</Link></div>
    </main>
  );
}
