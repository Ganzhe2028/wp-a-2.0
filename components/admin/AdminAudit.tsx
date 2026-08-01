"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "./AdminShell";
import { adminApi, AdminApiError, type AuditEntry, type AuditPage } from "./admin-api";

export default function AdminAudit() {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (cursor?: string, append = false) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (action) params.set("action", action);
    if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set("to", new Date(`${to}T23:59:59`).toISOString());
    if (cursor) params.set("cursor", cursor);
    try {
      type AuditResponse = AuditPage | {
        logs: Array<{
          id: string;
          createdAt: string;
          action: string;
          targetType: string;
          targetId: string;
          summary: string;
          requestId: string;
          actor?: { accountCode: string } | null;
        }>;
      };
      const result = await adminApi<AuditResponse>(`/audit-logs?${params.toString()}`);
      const resultItems = "items" in result ? result.items : result.logs.map((entry) => ({
        id: entry.id,
        createdAt: entry.createdAt,
        actorLabel: entry.actor?.accountCode ?? "SYSTEM",
        action: entry.action,
        targetType: entry.targetType,
        targetLabel: entry.targetId,
        summary: entry.summary,
        requestId: entry.requestId,
      }));
      setItems((current) => append ? [...current, ...resultItems] : resultItems);
      setNextCursor("nextCursor" in result ? result.nextCursor : null);
      if ("actionOptions" in result && result.actionOptions) setActions(result.actionOptions);
      else setActions((current) => [...new Set([...current, ...resultItems.map((entry) => entry.action)])].sort());
    } catch (cause) {
      setError(cause instanceof AdminApiError ? cause.message : "无法加载审计日志");
    } finally {
      setLoading(false);
    }
  }, [action, from, query, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <AdminShell title="Audit Log">
      <div className="p-5 sm:p-8">
        <div className="border border-[var(--orange)] bg-[var(--orange-soft)] p-4 text-sm">
          <b>只读审计记录</b>
          <p className="mt-2 text-neutral-700">记录设置、账号、导入、重置、归档、登录失败和权限拒绝等关键操作。日志不得包含密码、Token、Cookie、姓名或邮箱全文。</p>
        </div>
        {error && <p role="alert" className="mt-5 border-l-4 border-red-600 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}
        <section aria-label="审计筛选" className="mt-6 grid gap-3 border border-neutral-300 bg-white p-4 md:grid-cols-4">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="操作者 / 目标摘要 / requestId" className="min-h-11 border border-neutral-300 px-3" />
          <select value={action} onChange={(event) => setAction(event.target.value)} className="min-h-11 border border-neutral-300 bg-white px-3"><option value="">全部操作</option>{actions.map((value) => <option key={value}>{value}</option>)}</select>
          <label className="flex items-center gap-2 border border-neutral-300 px-3 text-xs font-bold">开始<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="min-h-10 min-w-0 flex-1" /></label>
          <label className="flex items-center gap-2 border border-neutral-300 px-3 text-xs font-bold">结束<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="min-h-10 min-w-0 flex-1" /></label>
        </section>
        <div className="mt-4 overflow-x-auto border border-neutral-300 bg-white">
          <table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-black text-white"><tr>{["时间", "操作者", "操作", "目标", "摘要", "Request ID"].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{items.map((entry) => <tr key={entry.id} className="border-b border-neutral-200 align-top"><td className="whitespace-nowrap p-3">{new Date(entry.createdAt).toLocaleString("zh-CN")}</td><td className="p-3 font-bold">{entry.actorLabel}</td><td className="p-3"><span className="border border-[var(--orange)] bg-[var(--orange-soft)] px-2 py-1 text-xs font-black">{entry.action}</span></td><td className="p-3"><b>{entry.targetType}</b><span className="mt-1 block text-xs text-neutral-500">{entry.targetLabel}</span></td><td className="max-w-md p-3 leading-6">{entry.summary}</td><td className="p-3 font-mono text-xs text-neutral-500">{entry.requestId}</td></tr>)}</tbody></table>
          {!loading && items.length === 0 && <p className="p-10 text-center text-neutral-500">没有符合条件的审计记录</p>}
          {loading && <p className="p-6 text-center font-bold text-neutral-500">加载中…</p>}
        </div>
        {nextCursor && <button onClick={() => void load(nextCursor, true)} disabled={loading} className="ow-btn ow-btn-outline mt-4">加载更多</button>}
      </div>
    </AdminShell>
  );
}
