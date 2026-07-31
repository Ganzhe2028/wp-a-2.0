"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import OweekHeader from "@/components/OweekHeader";
import { DAY3_SECTIONS, type Day3Answers } from "@/lib/flow";

function Bottle({ level }: { level: number }) {
  return <span className="relative block h-14 w-12 rounded-[12px] border-2 border-black bg-white before:absolute before:-top-2 before:left-1/2 before:h-2 before:w-6 before:-translate-x-1/2 before:rounded-t before:border-2 before:border-black before:bg-white"><span className="absolute inset-x-1 bottom-1 rounded-lg bg-[var(--orange)] transition-[height] duration-200" style={{ height: `${Math.max(0, level) * 17}%` }} /></span>;
}

export default function Day3Editor({ initialAnswers, submitted }: { initialAnswers: Day3Answers; submitted: boolean }) {
  const router = useRouter();
  const [answers, setAnswers] = useState(initialAnswers);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const total = useMemo(() => answers.flat().filter((value) => value > 0).length, [answers]);
  const section = DAY3_SECTIONS[sectionIndex];
  const sectionComplete = answers[sectionIndex].filter((value) => value > 0).length;

  const save = useCallback(async (action: "saveDay3" | "submitDay3") => {
    setSaving(true); setError("");
    const response = await fetch("/api/me/submissions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, answers }) });
    if (!response.ok) { const data = await response.json().catch(() => ({})); setError(data.error || "保存失败"); setSaving(false); return false; }
    setSaving(false); return true;
  }, [answers]);

  useEffect(() => {
    if (submitted) return;
    const timer = window.setTimeout(() => { void save("saveDay3"); }, 700);
    return () => window.clearTimeout(timer);
  }, [save, submitted]);

  function cycleLevel(promptIndex: number) {
    if (submitted) return;
    setAnswers((current) => current.map((values, index) => index === sectionIndex ? values.map((value, i) => i === promptIndex ? (value % 5) + 1 : value) : values));
  }

  async function submit() { if (await save("submitDay3")) { setConfirming(false); router.refresh(); router.push("/day3"); } }

  if (submitted) return <main className="ow-phone ow-enter"><OweekHeader title="MY PROFILE" action="HOME" actionHref="/home" /><div className="flex items-center justify-between"><h1 className="ow-heading">DAY 3 已提交</h1><span className="ow-chip ow-chip-active">SUBMITTED</span></div><p className="ow-muted mt-3">你已解锁 Browse 中其他人的 Day 3。</p><div className="mt-10 grid grid-cols-2 gap-4">{DAY3_SECTIONS.map((item, s) => <div key={item.title} className="border-2 border-[var(--orange)]"><div className="grid grid-cols-4 gap-2 p-4">{answers[s].slice(0, 16).map((level, i) => <span key={i} className="scale-75"><Bottle level={level} /></span>)}</div><b className="block bg-black p-3 text-white">{item.title.replace("的小瓶子", "")} · 32 项</b></div>)}</div><div className="mt-28 border-2 border-[var(--orange)] bg-[var(--orange-soft)] p-6"><b className="text-2xl">✓ 已发布 · 只读展示</b><p className="ow-muted mt-2">最后保存刚刚</p></div><Link href="/browse" className="ow-btn mt-24">去 Browse 看看 →</Link><Link href="/home" className="ow-btn ow-btn-outline mt-3">返回首页</Link></main>;

  return (
    <main className="ow-phone ow-enter">
      <OweekHeader title="LITTLE BOTTLES" action="保存草稿" actionHref="/home" />
      <div className="flex items-start justify-between gap-3"><div><h1 className="ow-heading">{section.title}</h1><p className="ow-muted mt-2">{section.subtitle}</p></div><span className="ow-chip ow-chip-active shrink-0">{total} / 64</span></div>
      <div className="mt-10 grid grid-cols-4 gap-x-3 gap-y-6">{section.prompts.map((prompt, index) => <button key={prompt} type="button" onClick={() => cycleLevel(index)} className="flex min-h-24 flex-col items-center gap-2" aria-label={`${prompt}，等级 ${answers[sectionIndex][index]}，点击增加`}><Bottle level={answers[sectionIndex][index]} /><span className="text-[11px] leading-tight">{prompt}</span></button>)}</div>
      <p className="mt-10 text-xl font-black">已选：{sectionComplete} / 32</p>
      {error && <p role="alert" className="mt-3 font-bold text-red-600">{error}</p>}
      {sectionIndex === 0 ? <button onClick={() => { setSectionIndex(1); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="ow-btn mt-14">下一页：安心小瓶子 →</button> : <button onClick={() => setConfirming(true)} className="ow-btn mt-14">提交 DAY 3 →</button>}
      {sectionIndex === 1 && <button onClick={() => setSectionIndex(0)} className="ow-btn ow-btn-outline mt-3">返回快乐源泉</button>}
      {saving && <p aria-live="polite" className="ow-muted mt-3 text-center">正在保存草稿…</p>}
      {confirming && <div className="ow-scrim fixed inset-0 z-50 flex items-center justify-center p-5" role="dialog" aria-modal="true"><div className="ow-modal w-full max-w-xl p-6"><h2 className="ow-heading">要提交 DAY 3 吗？</h2><p className="ow-muted mt-5 text-lg leading-8">你选择了 {total} 个小瓶子。未选择的项目会保持为空，提交后进入只读展示。</p><div className="mt-8 border-2 border-[var(--orange)] bg-[var(--orange-soft)] p-5 font-bold">已选择 {total} / 64 · 草稿已保存</div><button onClick={submit} disabled={saving} className="ow-btn mt-8">确认提交</button><button onClick={() => setConfirming(false)} className="ow-btn ow-btn-outline mt-3">返回检查</button></div></div>}
    </main>
  );
}
