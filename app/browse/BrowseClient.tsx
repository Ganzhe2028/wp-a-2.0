"use client";

import NextImage from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import StudentHeader from "@/components/student/StudentHeader";
import { PageError, PageLoading } from "@/components/student/AsyncState";
import { describeApiError, loginUrl, type Section, studentApi, StudentApiError } from "@/components/student/api";
import type { GalleryBrowseScope, GalleryItemContract, GalleryPageContract } from "@/lib/contracts";

interface HomeGate { browse: { canEnter: boolean; unlockedSections: Section[] } }
interface DivisionState { items: GalleryItemContract[]; cursor: string | null; loadingMore: boolean }

const emptyDivision = (): DivisionState => ({ items: [], cursor: null, loadingMore: false });

function Image(props: { src: string; alt: string; fill: boolean; sizes: string }) {
  return <NextImage {...props} unoptimized />;
}

export default function BrowseClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [unlocked, setUnlocked] = useState<Section[] | null>(null);
  const requested = searchParams.get("section")?.toUpperCase() === "DAY3" ? "DAY3" : "DAY1";
  const [section, setSection] = useState<Section>(requested);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [onlyWithContent, setOnlyWithContent] = useState(false);
  const [browseScope, setBrowseScope] = useState<GalleryBrowseScope>("ALL");
  const [senior, setSenior] = useState<DivisionState>(emptyDivision);
  const [learner, setLearner] = useState<DivisionState>(emptyDivision);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300); return () => window.clearTimeout(timer); }, [query]);
  const galleryUrl = useCallback((division: "SENIOR" | "LEARNER", cursor?: string | null) => { const params = new URLSearchParams({ section, division, limit: "30" }); if (debouncedQuery) params.set("query", debouncedQuery); if (onlyWithContent) params.set("filled", "true"); if (cursor) params.set("cursor", cursor); return `/api/v1/gallery?${params}`; }, [debouncedQuery, onlyWithContent, section]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const home = await studentApi<HomeGate>("/api/v1/home");
      const sections = home.browse.unlockedSections || [];
      setUnlocked(sections);
      if (!home.browse.canEnter || sections.length === 0) { setLoading(false); return; }
      const selected = sections.includes(section) ? section : sections[0];
      if (selected !== section) { setSection(selected); router.replace(`${pathname}?section=${selected.toLowerCase()}`); setLoading(false); return; }
      const [seniorPage, learnerPage] = await Promise.all([studentApi<GalleryPageContract>(galleryUrl("SENIOR")), studentApi<GalleryPageContract>(galleryUrl("LEARNER"))]);
      setBrowseScope(learnerPage.viewer.browseScope);
      setSenior({ items: seniorPage.items || [], cursor: seniorPage.nextCursor || null, loadingMore: false });
      setLearner({ items: learnerPage.items || [], cursor: learnerPage.nextCursor || null, loadingMore: false });
      setLoading(false);
    } catch (caught) {
      if (caught instanceof StudentApiError && caught.status === 401) { router.replace(loginUrl(`/browse?section=${section.toLowerCase()}`)); return; }
      setError(describeApiError(caught)); setLoading(false);
    }
  }, [galleryUrl, pathname, router, section]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  function select(next: Section) { setSection(next); router.replace(`${pathname}?section=${next.toLowerCase()}`); }
  async function more(division: "SENIOR" | "LEARNER") {
    const state = division === "SENIOR" ? senior : learner;
    const setter = division === "SENIOR" ? setSenior : setLearner;
    if (!state.cursor || state.loadingMore) return;
    setter({ ...state, loadingMore: true });
    try { const page = await studentApi<GalleryPageContract>(galleryUrl(division, state.cursor)); setter({ items: [...state.items, ...(page.items || [])], cursor: page.nextCursor || null, loadingMore: false }); }
    catch (caught) { setter({ ...state, loadingMore: false }); setError(describeApiError(caught)); }
  }

  const canBrowse = Boolean(unlocked?.length);
  const exactAnonymousHint = useMemo(() => query.startsWith("!") || query.startsWith("#") || query.startsWith("@") ? "匿名模式下请输入完整的 8 位符号 ID" : "搜索姓名或完整 Anonymous ID", [query]);
  if (loading && unlocked === null) return <PageLoading label="正在载入 Browse" />;
  if (error && unlocked === null) return <PageError message={error} retry={() => void load()} />;
  if (!canBrowse) return <BrowseGate close={() => router.replace("/home")} />;

  return <main className="ow-phone ow-enter"><StudentHeader title="BROWSE" /><div><p className="ow-kicker">DIGITAL EXHIBITION</p><h1 className="ow-heading mt-2">FIND AN ARTWORK.</h1><p className="ow-muted mt-3">{browseScope === "OWN_GROUP_LEARNERS" ? "当前仅显示你所在组的 Learner 主页。" : "每个账号都有自己的页面；你只能查看已用自己的作品解锁的 Section。"}</p></div><div className="mt-7 flex gap-3" role="tablist" aria-label="作品分区">{(["DAY1", "DAY3"] as Section[]).map((item) => { const available = unlocked?.includes(item); return <button key={item} role="tab" aria-selected={section === item} disabled={!available} onClick={() => select(item)} className={`ow-chip ${section === item ? "ow-chip-active" : ""}`}>{item.replace("DAY", "DAY ")} {available ? "✓" : "锁定"}</button>; })}</div><label className="student-search mt-6"><span className="sr-only">搜索作品</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={exactAnonymousHint} /><span aria-hidden="true">⌕</span></label><label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-[var(--line)] px-4 py-3 font-bold"><input type="checkbox" checked={onlyWithContent} onChange={(event) => setOnlyWithContent(event.target.checked)} className="h-5 w-5 accent-[var(--orange)]" /><span>只显示已填写内容的人</span></label>{error && <div className="student-notice mt-5" role="alert"><b>载入失败</b><p>{error}</p><button type="button" onClick={() => void load()} className="mt-2 min-h-11 font-bold underline">重试</button></div>}{loading ? <div className="mt-8"><div className="student-skeleton h-32" /><div className="student-skeleton mt-3 h-32" /></div> : <div className="mt-10 space-y-12">{browseScope === "ALL" && <GalleryDivision title="SENIOR GROUP" state={senior} section={section} onlyWithContent={onlyWithContent} more={() => void more("SENIOR")} />}<GalleryDivision title={browseScope === "OWN_GROUP_LEARNERS" ? "MY GROUP" : "LEARNERS"} state={learner} section={section} onlyWithContent={onlyWithContent} more={() => void more("LEARNER")} /></div>}</main>;
}

function BrowseGate({ close }: { close: () => void }) { return <main className="ow-phone flex min-h-svh items-center"><section className="student-state-card w-full text-center"><span className="mx-auto block h-14 w-14 border-4 border-[var(--orange)] p-3" aria-hidden="true"><span className="block h-full bg-[var(--orange)]" /></span><h1 className="ow-heading mt-8">先留下你的一点点。</h1><p className="ow-muted mt-5 leading-8">请先完成至少一个部分，再浏览其他人的展示。</p><Link href="/me/day-1" className="ow-btn mt-10">去填写 DAY 1</Link><Link href="/me/day-3" className="ow-btn ow-btn-outline mt-3">去填写 DAY 3</Link><button type="button" onClick={close} className="mt-4 min-h-11 w-full font-bold">关闭并返回 Home</button></section></main>; }

function GalleryDivision({ title, state, section, onlyWithContent, more }: { title: string; state: DivisionState; section: Section; onlyWithContent: boolean; more: () => void }) {
  return <section aria-labelledby={`division-${title.replace(/\s/g, "-")}`}><h2 id={`division-${title.replace(/\s/g, "-")}`} className="text-xl font-black">{title} · {String(state.items.length).padStart(2, "0")}</h2>{state.items.length === 0 ? <p className="student-empty mt-4">{onlyWithContent ? "这个分区暂时没有已填写内容的账号。" : "这个分区暂时没有账号。"}</p> : <div className="student-gallery mt-4">{state.items.map((item) => <Link key={item.publicId} href={`/artworks/${encodeURIComponent(item.publicId)}?section=${section.toLowerCase()}`} className="student-gallery-card"><span className="student-gallery-media">{item.thumbnail?.url ? <Image src={item.thumbnail.url} alt="作品缩略图" fill sizes="(max-width: 430px) 46vw, 260px" /> : <span aria-hidden="true">{item.sectionStates[section] === "AVAILABLE" ? "↗" : "·"}</span>}</span><strong className="student-display-name">{item.displayTitle}</strong>{item.roleLabel && <small>{item.roleLabel}</small>}</Link>)}</div>}{state.cursor && <button type="button" onClick={more} disabled={state.loadingMore} className="ow-btn ow-btn-outline mt-5">{state.loadingMore ? "载入中…" : "载入更多"}</button>}</section>;
}
