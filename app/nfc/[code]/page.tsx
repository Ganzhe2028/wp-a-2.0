import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DAY1_PROMPTS } from "@/lib/flow";
import { settingEnabled } from "@/lib/event-settings";

export default async function NfcProfile({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [person, profileComplete] = await Promise.all([
    prisma.person.findUnique({ where: { code }, select: { avatarUrl: true, day1SubmittedAt: true, day3SubmittedAt: true, images: { where: { hidden: false }, orderBy: { sort: "asc" }, take: 4, select: { id: true, url: true } } } }),
    settingEnabled("profileComplete"),
  ]);
  if (!person || !person.day1SubmittedAt) notFound();
  const anonymous = code.replace(/[A-Za-z0-9]/g, "#");
  return (
    <main className="ow-phone ow-enter">
      <p className="ow-kicker mt-12 text-xl">NFC / ARTWORK</p>
      <h1 className="ow-title mt-12 break-all">{anonymous}</h1>
      <p className="ow-kicker mt-2 text-xl">ANONYMOUS PROFILE</p>
      <div className="mt-8 grid grid-cols-2 gap-4"><span className="ow-btn">DAY 1</span><span className="ow-btn ow-btn-outline">DAY 3</span></div>
      {profileComplete ? (
        <div className="mt-10 grid grid-cols-2 gap-4">
          <figure className="row-span-2 overflow-hidden rounded-[var(--radius-tile)] border-[1.5px] border-black bg-black">{person.avatarUrl && <img src={person.avatarUrl} alt="头像" className="h-full min-h-64 w-full object-cover" />}<figcaption className="p-3 font-bold text-white">头像</figcaption></figure>
          {person.images.slice(0, 2).map((image, index) => <figure key={image.id} className="overflow-hidden rounded-[var(--radius-tile)] border-[1.5px] border-black bg-black"><img src={image.url} alt={DAY1_PROMPTS[index + 1]} className="aspect-video w-full object-cover" /><figcaption className="p-3 font-bold text-white">{DAY1_PROMPTS[index + 1]}</figcaption></figure>)}
        </div>
      ) : (
        <div className="mt-10 rounded-[var(--radius-card)] bg-[var(--paper)] p-6"><b className="text-xl">详情当前仅显示身份标题</b><p className="ow-muted mt-2">图片与小瓶子明细暂未开放。</p></div>
      )}
      <div className="mt-80 rounded-[var(--radius-card)] bg-[var(--paper)] p-6"><b className="text-xl">NFC 直达当前作品</b><p className="ow-muted mt-3">无 Home / Browse / 搜索 / 上一位</p></div>
      <p className="ow-orange mt-12 text-center font-bold">此页面不提供任何跨用户入口</p>
    </main>
  );
}
