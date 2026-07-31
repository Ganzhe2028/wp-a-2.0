"use client";

import { useState } from "react";
import Link from "next/link";
import OweekHeader from "@/components/OweekHeader";

type Person = { code: string; chineseName: string | null; englishName: string | null; role: string; groupName: string | null; day1: boolean; day3: boolean };

export default function BrowseClient({ people, day1Unlocked, day3Unlocked, showNames, forceGate }: { people: Person[]; day1Unlocked: boolean; day3Unlocked: boolean; showNames: boolean; forceGate: boolean }) {
  const [day, setDay] = useState<1 | 3>(day1Unlocked ? 1 : 3);
  const [gateOpen, setGateOpen] = useState(forceGate || (!day1Unlocked && !day3Unlocked));
  const unlocked = day === 1 ? day1Unlocked : day3Unlocked;
  const visible = people.filter((person) => day === 1 ? person.day1 : person.day3);
  const seniors = visible.filter((person) => person.role === "SENIOR");
  const learners = visible.filter((person) => person.role !== "SENIOR");

  function PersonRow({ person }: { person: Person }) {
    const displayName = showNames ? (person.chineseName || person.englishName || person.code) : person.code.replace(/[A-Za-z0-9]/g, (char, index) => "#@!&%$?!"[(char.charCodeAt(0) + index) % 8]);
    return <Link href={`/u/${person.code}?day=${day}`} className="flex min-h-20 items-center rounded-[var(--radius-tile)] border-2 border-[var(--line)] px-4"><span className="mr-4 h-12 w-12 shrink-0 rounded-full bg-black" /><span><b className="text-xl">{displayName}</b><small className="ow-muted mt-1 block">{person.groupName || (person.role === "SENIOR" ? "Senior Group" : "Learner")}</small></span><span className="ow-orange ml-auto text-4xl">→</span></Link>;
  }

  return (
    <main className="ow-phone ow-enter">
      <OweekHeader title="BROWSE" action="HOME" actionHref="/home" />
      <h1 className="ow-heading">FIND A PROFILE</h1><p className="ow-muted mt-2">你只能查看自己已提交过的分区。</p>
      <div className="mt-6 flex gap-3"><button onClick={() => setDay(1)} className={`ow-chip ${day === 1 ? "ow-chip-active" : ""}`}>DAY 1 {day1Unlocked && "✓"}</button><button onClick={() => setDay(3)} className={`ow-chip ${day === 3 ? "ow-chip-active" : ""}`}>DAY 3 {day3Unlocked ? "✓" : "锁定"}</button></div>
      {!unlocked ? <div className="mt-16 text-center"><div className="mx-auto h-14 w-14 border-4 border-[var(--orange)] p-3"><span className="block h-full bg-[var(--orange)]" /></div><h2 className="ow-heading mt-8">DAY {day} 尚未解锁</h2><p className="ow-muted mt-4">先提交你自己的 Day {day}，再查看其他人的这一部分。</p><Link href={`/day${day}`} className="ow-btn mt-12">去完成 DAY {day}</Link></div> : <div className="mt-10 space-y-8">{seniors.length > 0 && <section><h2 className="mb-4 text-xl font-black">SENIOR GROUP · {String(seniors.length).padStart(2, "0")}</h2><div className="space-y-2">{seniors.map((person) => <PersonRow key={person.code} person={person} />)}</div></section>}<section><h2 className="mb-4 text-xl font-black">LEARNERS · {String(learners.length).padStart(2, "0")}</h2><div className="space-y-2">{learners.map((person) => <PersonRow key={person.code} person={person} />)}</div></section></div>}
      {gateOpen && <div className="ow-scrim fixed inset-0 z-50 flex items-center justify-center p-5" role="dialog" aria-modal="true"><div className="ow-modal w-full max-w-xl p-6"><button onClick={() => setGateOpen(false)} aria-label="关闭" className="ow-orange ml-auto flex h-11 w-11 items-center justify-center text-4xl">×</button><h2 className="ow-heading">先留下你的一点点。</h2><p className="ow-muted mt-5 text-lg leading-8">请先完成至少一个部分，再浏览其他人的展示。</p><div className="my-7 h-px bg-[var(--line)]" /><Link href="/day1" className="ow-btn">去填写 DAY 1</Link><Link href="/day3" className="ow-btn ow-btn-outline mt-3">去填写 DAY 3</Link><p className="ow-muted mt-5 text-center">完成任一部分即可解锁 Browse</p></div></div>}
    </main>
  );
}
