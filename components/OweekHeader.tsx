import Link from "next/link";

export default function OweekHeader({ title, backHref = "/home", action, actionHref }: { title: string; backHref?: string; action?: string; actionHref?: string }) {
  return (
    <header className="ow-nav">
      <Link href={backHref} aria-label="返回" className="ow-orange text-4xl leading-none">←</Link>
      <strong className="text-lg tracking-tight">{title}</strong>
      {action && actionHref ? <Link href={actionHref} className="ow-orange justify-end font-bold">{action}</Link> : <span />}
    </header>
  );
}