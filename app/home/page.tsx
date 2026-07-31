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
    <main className="ow-phone ow-home ow-enter" aria-label="今日任务">
      <header className="ow-home-nav">
        <strong>HOME</strong>
        <LogoutButton compact />
      </header>

      <section className="ow-home-greeting" aria-labelledby="home-greeting">
        <p>HELLO,</p>
        <h1 id="home-greeting">{name}</h1>
        <h2>今天想做什么？</h2>
      </section>

      <nav className="ow-home-tasks" aria-label="活动入口">
        <Link href={day1Open ? "/day1" : "/home"} aria-disabled={!day1Open} className={`ow-home-task ${!day1Open ? "ow-home-task-disabled" : ""}`}>
          <span className="ow-home-task-top"><b>01</b><span>{!day1Open ? "未开放" : day1Action}</span></span>
          <strong>DAY 1</strong>
          <p>照片拼贴 · {person.day1SubmittedAt ? "已提交" : "未提交"}</p>
          <span className="ow-home-task-arrow" aria-hidden="true">→</span>
        </Link>
        <Link href={day3Open ? "/day3" : "/home"} aria-disabled={!day3Open} className={`ow-home-task ow-home-task-accent ${!day3Open ? "ow-home-task-disabled" : ""}`}>
          <span className="ow-home-task-top"><b>03</b><span>{!day3Open ? "未开放" : day3Action}</span></span>
          <strong>DAY 3</strong>
          <p>小瓶子 · {day3Progress} / 64</p>
          <span className="ow-home-task-arrow" aria-hidden="true">→</span>
        </Link>
        <Link href={navEnabled ? (browseUnlocked ? "/browse" : "/browse?gate=1") : "/home"} aria-disabled={!navEnabled} className={`ow-home-task ${!navEnabled ? "ow-home-task-disabled" : ""}`}>
          <span className="ow-home-task-top"><b className="ow-arrow">↗</b><span>{!navEnabled ? "未开放" : browseUnlocked ? "已解锁" : "未解锁"}</span></span>
          <strong>BROWSE</strong>
          <p>浏览 Senior Group 与 Learners</p>
          <span className="ow-home-task-arrow" aria-hidden="true">→</span>
        </Link>
      </nav>

      <footer className="ow-home-footer"><span>完成任一部分即可解锁</span><Link href="/browse">查看规则</Link></footer>
    </main>
  );
}
