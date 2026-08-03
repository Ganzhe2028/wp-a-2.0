import Link from "next/link";
import StudentHeader from "@/components/student/StudentHeader";

export const metadata = { title: "帮助" };
export default function HelpPage() {
  return <main className="ow-phone ow-enter"><StudentHeader title="HELP" /><p className="ow-kicker">HOW IT WORKS</p><h1 className="ow-heading mt-2">留下作品，再去认识彼此。</h1><div className="mt-10 space-y-4"><HelpItem number="01" title="IT’S ME" text="为每个图片槽选择一张图，调整构图并保存。全部必填槽完成后即可提交。" /><HelpItem number="03" title="LITTLE BOTTLES" text="点击或拖动瓶身设置 0–5 级液位。0 是有效答案；每个必答瓶都需要主动确认。" /><HelpItem number="↗" title="BROWSE" text="提交任一 Section 后解锁 Browse。你只能查看自己已经提交过的同一 Section。" /></div><section className="student-notice mt-10"><b>遇到账号问题？</b><p>请联系学长团成员，并提供页面情况。</p></section><Link href="/privacy" className="ow-btn ow-btn-outline mt-8">查看隐私说明</Link></main>;
}
function HelpItem({ number, title, text }: { number: string; title: string; text: string }) { return <section className="student-help-card"><span>{number}</span><div><h2>{title}</h2><p>{text}</p></div></section>; }
