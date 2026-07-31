"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import OweekHeader from "@/components/OweekHeader";
import AvatarUploader from "@/components/AvatarUploader";
import ImageGrid from "@/components/ImageGrid";
import { DAY1_PROMPTS } from "@/lib/flow";

type Person = { code: string; avatarUrl: string | null; day1SubmittedAt: Date | null; images: { id: string; url: string; sort: number }[] };

export default function Day1Editor({ person }: { person: Person }) {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState(person.avatarUrl);
  const [images, setImages] = useState(person.images);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const completed = (avatarUrl ? 1 : 0) + images.length;
  const submitted = Boolean(person.day1SubmittedAt);

  async function saveAvatar(url: string | null) {
    const response = await fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ avatarUrl: url || null }) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "头像保存失败");
    }
    setAvatarUrl(url);
  }

  async function submit() {
    setSubmitting(true); setError("");
    const response = await fetch("/api/me/submissions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submitDay1" }) });
    if (!response.ok) { const data = await response.json().catch(() => ({})); setError(data.error || "提交失败"); setSubmitting(false); return; }
    router.refresh(); router.push("/submitted/day1");
  }

  if (submitted) return (
    <main className="ow-phone ow-enter"><OweekHeader title="MY PROFILE" action="HOME" actionHref="/home" /><div className="flex items-center justify-between"><h1 className="ow-heading">DAY 1 已提交</h1><span className="ow-chip ow-chip-active">SUBMITTED</span></div><p className="ow-muted mt-3">你已解锁 Browse 中其他人的 Day 1。</p><div className="mt-10 grid grid-cols-2 gap-2"><div className="relative aspect-square overflow-hidden border-2 border-[var(--orange)]">{avatarUrl && <img src={avatarUrl} alt="头像" className="h-full w-full object-cover" />}</div>{images.slice(0, 3).map((image) => <div key={image.id} className="aspect-square overflow-hidden border-2 border-[var(--orange)]"><img src={image.url} alt="" className="h-full w-full object-cover" /></div>)}</div><div className="mt-28 border-2 border-[var(--orange)] bg-[var(--orange-soft)] p-6"><b className="text-2xl">✓ 已发布 · 只读展示</b><p className="ow-muted mt-2">提交后内容由管理员开放编辑时才可修改。</p></div><Link href="/browse" className="ow-btn mt-24">去 Browse 看看 →</Link><Link href="/home" className="ow-btn ow-btn-outline mt-3">返回首页</Link></main>
  );

  return (
    <main className="ow-phone ow-enter">
      <OweekHeader title="IT’S ME" action="保存草稿" actionHref="/home" />
      <div className="flex items-start justify-between gap-4"><div><h1 className="ow-heading">把你拼进这一页。</h1><p className="ow-muted mt-2">点击任意格上传；拖动图片调整位置。</p></div><span className="ow-chip ow-chip-active shrink-0">{completed} / 15</span></div>
      <div className="mt-8 grid grid-cols-2 gap-2">
        <div className="border-2 border-black p-2"><AvatarUploader currentUrl={avatarUrl} onAvatarChange={saveAvatar} disabled={false} /><b className="mt-2 block">头像</b></div>
        <div className="col-span-2"><ImageGrid images={images} onImagesChange={setImages} maxImages={14} labels={DAY1_PROMPTS.slice(1)} /></div>
      </div>
      <p className="ow-muted mt-8">自动保存于刚刚</p>
      <button type="button" onClick={() => setConfirming(true)} disabled={completed < 15} className="ow-btn mt-14">提交 DAY 1 →</button>
      {confirming && <div className="ow-scrim fixed inset-0 z-50 flex items-center justify-center p-5" role="dialog" aria-modal="true" aria-labelledby="day1-confirm"><div className="ow-modal w-full max-w-xl p-6"><h2 id="day1-confirm" className="ow-heading">要提交 DAY 1 吗？</h2><p className="ow-muted mt-5 text-lg leading-8">{completed} / 15 个图片格已完成。提交后默认进入只读展示。</p><div className="mt-8 border-2 border-[var(--orange)] bg-[var(--orange-soft)] p-5 font-bold">完成度 100% · 草稿已保存</div>{error && <p role="alert" className="mt-4 font-bold text-red-600">{error}</p>}<button onClick={submit} disabled={submitting} className="ow-btn mt-8">{submitting ? "提交中…" : "确认提交"}</button><button onClick={() => setConfirming(false)} className="ow-btn ow-btn-outline mt-3">返回检查</button></div></div>}
    </main>
  );
}
