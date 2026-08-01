"use client";
/* eslint-disable @next/next/no-img-element -- authenticated R2 URLs are short-lived and intentionally unoptimized */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import StudentHeader from "@/components/student/StudentHeader";
import { PageError, PageLoading } from "@/components/student/AsyncState";
import { describeApiError, loginUrl, studentApi, StudentApiError, type Section } from "@/components/student/api";
import type { ArtworkIdentityOnlyReason } from "@/lib/contracts";

type SectionState = "AVAILABLE" | "LOCKED" | "NO_CONTENT";
interface ArtworkSlot { slotKey: string; label?: string; imageUrl?: string; url?: string; crop?: { x: number; y: number; scale: number } }
interface ArtworkBottle { bottleKey: string; label?: string; labelSnapshot?: string; level: number | null; isConfirmed?: boolean; group?: string; groupSubtitle?: string }
interface ArtworkSection { state: SectionState; content: null | { templateVersion?: string; slots?: ArtworkSlot[]; bottles?: ArtworkBottle[] } }
interface ArtworkData {
  publicId: string;
  displayTitle: string;
  isAnonymous: boolean;
  profileVisibility?: "IDENTITY_ONLY" | "FULL";
  identityOnlyReason?: ArtworkIdentityOnlyReason;
  message?: string;
  navigation?: { canReturnToGallery?: boolean; canNavigateCollection?: boolean; previousPublicId?: string; nextPublicId?: string };
  sections?: Partial<Record<Section, ArtworkSection>>;
}

export default function ArtworkClient({ publicId }: { publicId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested: Section = params.get("section")?.toUpperCase() === "DAY3" ? "DAY3" : "DAY1";
  const [section, setSection] = useState<Section>(requested);
  const [data, setData] = useState<ArtworkData | null>(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setError(""); setNotFound(false);
    try { setData(await studentApi<ArtworkData>(`/api/v1/artworks/${encodeURIComponent(publicId)}`)); }
    catch (caught) {
      if (caught instanceof StudentApiError && caught.status === 401) { router.replace(loginUrl(`${pathname}?section=${section.toLowerCase()}`)); return; }
      if (caught instanceof StudentApiError && caught.status === 404) { setNotFound(true); return; }
      setError(describeApiError(caught));
    }
  }, [pathname, publicId, router, section]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  function choose(next: Section) { setSection(next); router.replace(`${pathname}?section=${next.toLowerCase()}`); }
  if (!data && !error && !notFound) return <PageLoading label="正在载入作品" />;
  if (!data && error) return <PageError message={error} retry={() => void load()} />;
  if (!data && notFound) return <main className="ow-phone"><StudentHeader title="ARTWORK" /><div className="student-state-card mt-20"><p className="ow-kicker">404 · NOT FOUND</p><h1 className="ow-heading mt-3">找不到这件作品。</h1><p className="ow-muted mt-4">链接可能无效、已撤销，或作品当前不可公开。</p><Link href="/browse" className="ow-btn mt-8">返回 Browse</Link></div></main>;
  if (!data) return null;

  if (data.profileVisibility === "IDENTITY_ONLY") { const empty = data.identityOnlyReason === "NO_CONTENT"; return <main className="ow-phone ow-enter"><StudentHeader title={empty ? "PROFILE" : "FIND PACKAGE"} backHref={data.navigation?.canReturnToGallery ? "/browse" : "/home"} /><section className="student-identity-only"><p className="ow-kicker">{empty ? "O—WEEK PAGE" : "THIS PACKAGE BELONGS TO"}</p><h1 className="student-identity-title break-all">{data.displayTitle}</h1>{!empty && <p>请将礼包交给这位同学</p>}</section></main>; }

  const selected = data.sections?.[section] || { state: "NO_CONTENT" as const, content: null };
  return <main className="ow-phone ow-enter"><StudentHeader title="ARTWORK" backHref={data.navigation?.canReturnToGallery ? `/browse?section=${section.toLowerCase()}` : "/home"} /><header><p className="ow-kicker">{data.isAnonymous ? "ANONYMOUS ARTWORK" : "O—WEEK ARTWORK"}</p><h1 className="ow-title mt-2 break-all">{data.displayTitle}</h1></header><div className="mt-8 grid grid-cols-2 gap-3" role="tablist" aria-label="作品 Section">{(["DAY1", "DAY3"] as Section[]).map((item) => <button key={item} role="tab" aria-selected={section === item} onClick={() => choose(item)} className={`ow-btn ${section !== item ? "ow-btn-outline" : ""}`}>{item.replace("DAY", "DAY ")}</button>)}</div><section className="mt-8" role="tabpanel">{selected.state === "LOCKED" ? <SectionStateCard kind="locked" section={section} /> : selected.state === "NO_CONTENT" ? <SectionStateCard kind="empty" section={section} /> : section === "DAY1" ? <Day1Artwork slots={selected.content?.slots || []} /> : <Day3Artwork bottles={selected.content?.bottles || []} />}</section>{data.navigation?.canNavigateCollection && <nav className="mt-12 grid grid-cols-2 gap-3" aria-label="相邻作品">{data.navigation.previousPublicId ? <Link className="ow-btn ow-btn-outline" href={`/artworks/${encodeURIComponent(data.navigation.previousPublicId)}?section=${section.toLowerCase()}`}>← 上一件</Link> : <span />}{data.navigation.nextPublicId && <Link className="ow-btn ow-btn-outline" href={`/artworks/${encodeURIComponent(data.navigation.nextPublicId)}?section=${section.toLowerCase()}`}>下一件 →</Link>}</nav>}</main>;
}

function SectionStateCard({ kind, section }: { kind: "locked" | "empty"; section: Section }) { return <div className="student-state-card text-center"><span className={kind === "locked" ? "student-lock-mark" : "student-empty-mark"} aria-hidden="true" /><h2 className="ow-heading mt-8">{kind === "locked" ? `${section.replace("DAY", "DAY ")} 尚未解锁` : "对方暂未发布此作品"}</h2><p className="ow-muted mt-4 leading-7">{kind === "locked" ? `先提交你自己的 ${section.replace("DAY", "Day ")}，再查看其他人的这一部分。` : "你已经拥有浏览权限；这里目前没有公开内容。"}</p>{kind === "locked" && <Link href={section === "DAY1" ? "/me/day-1" : "/me/day-3"} className="ow-btn mt-8">去完成 {section.replace("DAY", "DAY ")}</Link>}</div>; }

function Day1Artwork({ slots }: { slots: ArtworkSlot[] }) { return slots.length ? <div className="student-artwork-collage">{slots.map((slot, index) => { const url = slot.imageUrl || slot.url; const crop = slot.crop || { x: .5, y: .5, scale: 1 }; return <figure key={slot.slotKey} className={`student-artwork-slot student-slot-${index % 6}`}>{url && <img src={url} alt={slot.label || "作品图片"} style={{ transform: `translate(${(crop.x - .5) * 36}%, ${(crop.y - .5) * 36}%) scale(${crop.scale})` }} />}<figcaption>{slot.label || "作品图片"}</figcaption></figure>; })}</div> : <p className="student-empty">作品正在准备中。</p>; }

function Day3Artwork({ bottles }: { bottles: ArtworkBottle[] }) {
  if (!bottles.length) return <p className="student-empty">作品正在准备中。</p>;
  const themes = new Map<string, { subtitle: string; bottles: ArtworkBottle[] }>();
  for (const bottle of bottles) {
    const title = bottle.group || "LITTLE BOTTLES";
    const theme = themes.get(title) || { subtitle: bottle.groupSubtitle || "", bottles: [] };
    theme.bottles.push(bottle);
    themes.set(title, theme);
  }
  return <div className="grid gap-12">{Array.from(themes, ([title, theme], themeIndex) => <section key={title} aria-labelledby={`artwork-bottle-theme-${themeIndex}`}><p className="ow-kicker">THEME {String(themeIndex + 1).padStart(2, "0")}</p><h2 id={`artwork-bottle-theme-${themeIndex}`} className="mt-2 text-2xl font-black">{title}</h2>{theme.subtitle && <p className="ow-muted mt-2 leading-6">{theme.subtitle}</p>}<div className="student-bottle-grid mt-6">{theme.bottles.map((bottle) => <div key={bottle.bottleKey} className="student-bottle-item"><span className="student-bottle" aria-label={`${bottle.label || bottle.labelSnapshot || "瓶子"}，液位 ${bottle.level ?? 0}，共 5 级`}><span className="student-bottle-neck" /><span className="student-bottle-liquid" style={{ height: `${(bottle.level ?? 0) * 20}%` }} /></span><span className="student-bottle-label">{bottle.label || bottle.labelSnapshot || "瓶子"}</span></div>)}</div></section>)}</div>;
}
