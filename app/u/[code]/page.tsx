import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyStudentSession } from "@/lib/auth";
import { DAY1_PROMPTS, DAY3_SECTIONS, parseDay3Answers } from "@/lib/flow";
import OweekHeader from "@/components/OweekHeader";

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ day?: string }> }) {
  const { code } = await params;
  const session = await verifyStudentSession();
  if (!session) redirect(`/?next=${encodeURIComponent(`/u/${code}`)}`);
  const [{ day }, viewer, person, showNamesSetting] = await Promise.all([
    searchParams,
    prisma.person.findUnique({ where: { id: session.personId }, select: { day1SubmittedAt: true, day3SubmittedAt: true } }),
    prisma.person.findUnique({ where: { code }, include: { images: { where: { hidden: false }, orderBy: { sort: "asc" } } } }),
    prisma.systemSetting.findUnique({ where: { key: "showNames" }, select: { value: true } }),
  ]);
  if (!person || person.hidden) return <main className="ow-phone"><OweekHeader title="PROFILE" backHref="/browse" /><h1 className="ow-heading mt-20">该页面已隐藏</h1><Link href="/browse" className="ow-btn ow-btn-outline mt-16">返回浏览</Link></main>;
  const selectedDay = day === "3" ? 3 : 1;
  const canView = selectedDay === 1 ? Boolean(viewer?.day1SubmittedAt) : Boolean(viewer?.day3SubmittedAt);
  const hasContent = selectedDay === 1 ? Boolean(person.day1SubmittedAt) : Boolean(person.day3SubmittedAt);
  const showNames = showNamesSetting?.value === "true";
  const displayName = showNames ? (person.chineseName || person.englishName || code) : code.replace(/[A-Za-z0-9]/g, "#");
  const answers = parseDay3Answers(person.day3Answers);

  return (
    <main className="ow-phone ow-enter">
      <OweekHeader title="PROFILE" backHref="/browse" />
      <h1 className="ow-title break-all">{displayName}</h1><p className="ow-kicker mt-2">{person.role === "SENIOR" ? "SENIOR GROUP" : "LEARNER"} · {person.groupName || "O-WEEK"}</p>
      <div className="mt-8 grid grid-cols-2 gap-4"><Link href={`/u/${code}?day=1`} className={`ow-btn ${selectedDay !== 1 ? "ow-btn-outline" : ""}`}>DAY 1</Link><Link href={`/u/${code}?day=3`} className={`ow-btn ${selectedDay !== 3 ? "ow-btn-outline" : ""}`}>DAY 3</Link></div>
      {!canView ? <div className="mt-28 text-center"><div className="mx-auto h-14 w-14 border-4 border-[var(--orange)] p-3"><span className="block h-full bg-[var(--orange)]" /></div><h2 className="ow-heading mt-8">DAY {selectedDay} 尚未解锁</h2><p className="ow-muted mt-5 text-lg leading-8">先提交你自己的 Day {selectedDay}，再查看其他人的这一部分。</p><div className="mt-12 border-2 border-[var(--orange)] bg-[var(--orange-soft)] p-5 font-bold">权限由你的提交状态决定，不由对方是否填写决定。</div><Link href={`/day${selectedDay}`} className="ow-btn mt-20">去完成 DAY {selectedDay}</Link></div> : !hasContent ? <div className="mt-28 text-center"><span className="mx-auto block h-14 w-14 rounded-full border-[10px] border-[var(--orange)]" /><h2 className="ow-heading mt-8">对方暂未发布此作品</h2><p className="ow-muted mt-5 text-lg">你已经拥有浏览权限。这里不是锁定状态。</p><div className="mt-12 bg-[var(--paper)] p-6 font-bold ow-muted">200 · ownerStatus=NO_CONTENT</div><Link href="/browse" className="ow-btn ow-btn-outline mt-24">返回浏览</Link></div> : selectedDay === 1 ? <div className="mt-8 grid grid-cols-2 gap-4"><div className="row-span-2 overflow-hidden border-2 border-black">{person.avatarUrl && <img src={person.avatarUrl} alt={DAY1_PROMPTS[0]} className="h-full min-h-72 w-full object-cover" />}</div>{person.images.map((image, index) => <figure key={image.id} className={`${index === 2 ? "col-span-2" : ""} overflow-hidden border-2 border-black bg-black`}><img src={image.url} alt={DAY1_PROMPTS[index + 1] || "资料图片"} className="aspect-video w-full object-cover" loading={index > 3 ? "lazy" : "eager"} /><figcaption className="p-3 font-bold text-white">{DAY1_PROMPTS[index + 1]}</figcaption></figure>)}</div> : <div className="mt-10 space-y-8">{DAY3_SECTIONS.map((section, s) => <section key={section.title}><h2 className="text-2xl font-black">{section.title}</h2><div className="mt-5 grid grid-cols-4 gap-3">{section.prompts.map((prompt, index) => <div key={prompt} className="text-center"><div className="relative mx-auto h-14 w-10 rounded-xl border-2 border-black"><span className="absolute inset-x-1 bottom-1 rounded-lg bg-[var(--orange)]" style={{ height: `${answers[s][index] * 17}%` }} /></div><small>{prompt}</small></div>)}</div></section>)}</div>}
      {canView && hasContent && <Link href="/browse" className="ow-btn ow-btn-outline mt-14">返回浏览</Link>}
    </main>
  );
}
