import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function PackageCard({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const person = await prisma.person.findUnique({ where: { code }, select: { chineseName: true, englishName: true } });
  if (!person) notFound();
  return <main className="min-h-svh bg-[#080808] px-7 py-14 text-white"><div className="mx-auto flex min-h-[calc(100svh-7rem)] max-w-md flex-col"><p className="font-black text-[var(--orange)]">PACKAGE / OWNER</p><h1 className="mt-28 text-6xl font-black tracking-tight">{person.chineseName || person.englishName || code}</h1><div className="mt-12 h-2 bg-[var(--orange)]" /><h2 className="mt-10 text-3xl font-black">只显示姓名</h2><p className="mt-4 text-xl text-neutral-400">不展示图片、瓶子、邮箱、组别或目录入口。</p><p className="mt-auto text-3xl font-black">请将礼包交给这位同学</p><p className="mt-24 font-black text-[var(--orange)]">NFC / SAME ARTWORK URL</p></div></main>;
}
