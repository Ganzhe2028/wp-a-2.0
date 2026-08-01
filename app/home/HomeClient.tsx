"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageError, PageLoading } from "@/components/student/AsyncState";
import StudentHeader from "@/components/student/StudentHeader";
import { describeApiError, loginUrl, type Section, studentApi, StudentApiError, type SubmissionStatus } from "@/components/student/api";

type HomeAction = "CREATE" | "CONTINUE" | "VIEW" | "EDIT" | "CLOSED" | "WAITING";
interface HomeSection { status: SubmissionStatus; canEnter: boolean; canEdit: boolean; progress: { completed: number; total: number }; action: HomeAction }
interface HomeData {
  identity: { displayTitle: string; isAnonymous: boolean };
  capabilities: { authoringEnabled: boolean };
  day1: HomeSection;
  day3: HomeSection;
  browse: { visible: boolean; canEnter: boolean; unlockedSections: Section[] };
}

const actionLabel: Record<HomeAction, string> = { CREATE: "开始创作", CONTINUE: "继续创作", VIEW: "查看作品", EDIT: "编辑作品", CLOSED: "当前只读", WAITING: "尚未开放" };

export default function HomeClient() {
  const router = useRouter();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try { setData(await studentApi<HomeData>("/api/v1/home")); }
    catch (caught) {
      if (caught instanceof StudentApiError && caught.status === 401) { router.replace(loginUrl("/home")); return; }
      setError(describeApiError(caught));
    }
  }, [router]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  if (!data && !error) return <PageLoading label="正在载入首页" />;
  if (!data) return <PageError message={error} retry={() => void load()} />;

  const firstSection = data.browse.unlockedSections[0]?.toLowerCase() || "day1";
  return (
    <main className="ow-phone student-home ow-enter" aria-label="今日任务">
      <StudentHeader title="HOME" backHref={null} showLogout />
      <section className="ow-home-greeting" aria-labelledby="home-greeting">
        <p>{data.identity.isAnonymous ? "ANONYMOUS ID" : "HELLO,"}</p>
        <h1 id="home-greeting" className="break-all">{data.identity.displayTitle}</h1>
        <h2>今天想做什么？</h2>
      </section>
      <nav className="ow-home-tasks" aria-label="作品入口">
        <TaskCard number="01" title="IT’S ME" description="用 15 张图片拼出你自己" href="/me/day-1" section={data.day1} authoring={data.capabilities.authoringEnabled} />
        <TaskCard number="03" title="LITTLE BOTTLES" description="用液位留下此刻的你" href="/me/day-3" section={data.day3} authoring={data.capabilities.authoringEnabled} accent />
        <Link href={data.browse.canEnter ? `/browse?section=${firstSection}` : "/browse"} aria-disabled={!data.browse.visible} className={`ow-home-task ${!data.browse.visible ? "ow-home-task-disabled" : ""}`}>
          <span className="ow-home-task-top"><b aria-hidden="true">↗</b><span>{data.browse.canEnter ? "已解锁" : "完成作品后解锁"}</span></span>
          <strong>BROWSE</strong><p>浏览 Senior Group 与 Learners 的作品</p><span className="ow-home-task-arrow" aria-hidden="true">→</span>
        </Link>
      </nav>
      <footer className="ow-home-footer"><span>{data.browse.canEnter ? `已解锁 ${data.browse.unlockedSections.join(" / ")}` : "完成任一部分即可解锁"}</span><Link href="/help">查看规则</Link></footer>
    </main>
  );
}

function TaskCard({ number, title, description, href, section, authoring, accent = false }: { number: string; title: string; description: string; href: string; section: HomeSection; authoring: boolean; accent?: boolean }) {
  const enabled = section.canEnter;
  const label = !authoring && section.status !== "SUBMITTED" ? "当前只读" : actionLabel[section.action] || "查看状态";
  return <Link href={enabled ? href : "/home"} aria-disabled={!enabled} className={`ow-home-task ${accent ? "ow-home-task-accent" : ""} ${!enabled ? "ow-home-task-disabled" : ""}`}><span className="ow-home-task-top"><b>{number}</b><span>{label}</span></span><strong>{title}</strong><p>{description} · {section.progress.completed}/{section.progress.total}</p><span className="ow-home-task-arrow" aria-hidden="true">→</span></Link>;
}
