"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell from "./AdminShell";
import { adminApi, AdminApiError, newIdempotencyKey, type DashboardData, type EventSettings } from "./admin-api";

const PRESETS = [
  { id: "DAY1_AUTHORING", label: "DAY 1 创作", note: "开放 It’s Me 创作阶段" },
  { id: "DAY3_AUTHORING", label: "DAY 3 创作", note: "开放 Little Bottles 创作阶段" },
  { id: "PRE_EVENT_BROWSE", label: "活动前浏览", note: "实名查看已解锁作品" },
  { id: "RULES_PREP", label: "规则准备", note: "进入游戏前的匿名规则说明状态" },
  { id: "GAME_IN_PROGRESS", label: "游戏进行", note: "匿名作品游戏状态" },
  { id: "FIND_PACKAGE", label: "找礼包", note: "活动结束后的身份认领" },
] as const;

const SETTING_LABELS: Array<{ key: keyof Omit<EventSettings, "version">; label: string; note: string }> = [
  { key: "day1Open", label: "Day 1 开放", note: "允许进入 Day 1 编辑或只读页面" },
  { key: "day3Open", label: "Day 3 开放", note: "允许进入 Day 3 编辑或只读页面" },
  { key: "authoringEnabled", label: "作品编写 / 提交", note: "Learner 与 Senior Group（含 Counselor）共用总开关" },
  { key: "allowEditing", label: "已提交作品重新编辑", note: "允许 SUBMITTED 作品回到编辑状态" },
  { key: "showName", label: "显示真实姓名", note: "关闭后前台仅使用 8 位匿名 ID" },
  { key: "fullProfileVisible", label: "显示完整作品", note: "关闭后详情只显示身份标题" },
  { key: "seniorCanBrowseAll", label: "Senior 可浏览全部主页", note: "关闭时 Senior 只能查看自己组内的 Learner；Counselor、Learner 与 Admin 始终可以查看全部" },
];

function MetricCard({ title, value }: { title: string; value: { submitted: number; eligible: number; percentage: number } }) {
  const percentage = Number.isFinite(value.percentage) ? Math.max(0, Math.min(100, value.percentage)) : 0;
  return (
    <article className="border border-neutral-300 bg-white p-5">
      <p className="text-xs font-black tracking-[.08em] text-neutral-500">{title}</p>
      <p className="mt-4 text-4xl font-black tracking-[-.06em]">{value.submitted}<span className="text-xl text-neutral-400"> / {value.eligible}</span></p>
      <div className="mt-5 h-2 bg-neutral-200"><span className="block h-full bg-[var(--orange)]" style={{ width: `${percentage}%` }} /></div>
      <p className="mt-2 text-right text-xs font-black text-[var(--orange)]">{Math.round(percentage)}%</p>
    </article>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [draft, setDraft] = useState<EventSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflicted, setConflicted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      type DashboardResponse = DashboardData | {
        settings: EventSettings & { updatedAt?: string };
        accounts: { total: number };
        completion: {
          day1: { submitted: number; total: number };
          day3: { submitted: number; total: number };
        };
      };
      const result = await adminApi<DashboardResponse>("/dashboard");
      const normalized: DashboardData = "phase" in result ? result : {
        phase: "自定义设置",
        lastSyncedAt: result.settings.updatedAt ?? null,
        provisionedAccountCount: result.accounts.total,
        completion: {
          day1: { submitted: result.completion.day1.submitted, eligible: result.completion.day1.total, percentage: result.completion.day1.total ? result.completion.day1.submitted / result.completion.day1.total * 100 : 0 },
          day3: { submitted: result.completion.day3.submitted, eligible: result.completion.day3.total, percentage: result.completion.day3.total ? result.completion.day3.submitted / result.completion.day3.total * 100 : 0 },
        },
        settings: result.settings,
      };
      setData(normalized);
      setDraft(normalized.settings);
      setConflicted(false);
    } catch (cause) {
      setError(cause instanceof AdminApiError ? cause.message : "无法加载 Dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const changes = useMemo(() => {
    if (!data || !draft) return {};
    return Object.fromEntries(
      SETTING_LABELS.filter(({ key }) => data.settings[key] !== draft[key]).map(({ key }) => [key, draft[key]]),
    );
  }, [data, draft]);
  const dirtyCount = Object.keys(changes).length;

  async function saveSettings() {
    if (!data || !draft || dirtyCount === 0) return;
    const summary = SETTING_LABELS.filter(({ key }) => key in changes).map(({ label, key }) => `${label}：${draft[key] ? "开启" : "关闭"}`).join("\n");
    if (!window.confirm(`确认应用以下高风险设置？\n\n${summary}`)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await adminApi<{ settings: EventSettings }>("/settings", {
        method: "PATCH",
        body: JSON.stringify({ version: data.settings.version, changes, confirm: true, idempotencyKey: newIdempotencyKey() }),
      });
      setData((current) => current ? { ...current, settings: result.settings } : current);
      setDraft(result.settings);
      setNotice(`设置已保存，当前版本 v${result.settings.version}。`);
    } catch (cause) {
      if (cause instanceof AdminApiError && (cause.status === 409 || cause.code === "VERSION_CONFLICT")) {
        setConflicted(true);
        setError("设置已被另一位管理员更新。请刷新最新版本，再重新确认你的修改。");
      } else setError(cause instanceof AdminApiError ? cause.message : "保存设置失败");
    } finally { setSaving(false); }
  }

  async function applyPreset(preset: (typeof PRESETS)[number]) {
    if (!data || !window.confirm(`应用「${preset.label}」预设？这会一次修改多项活动设置。`)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await adminApi<{ settings: EventSettings }>("/settings/apply-preset", {
        method: "POST",
        body: JSON.stringify({ version: data.settings.version, preset: preset.id, confirm: true, idempotencyKey: newIdempotencyKey() }),
      });
      setData((current) => current ? { ...current, settings: result.settings, phase: preset.label } : current);
      setDraft(result.settings);
      setNotice(`已应用「${preset.label}」，当前版本 v${result.settings.version}。`);
    } catch (cause) {
      if (cause instanceof AdminApiError && (cause.status === 409 || cause.code === "VERSION_CONFLICT")) {
        setConflicted(true);
        setError("预设未应用：设置版本已经变化。请刷新后重新确认。");
      } else setError(cause instanceof AdminApiError ? cause.message : "应用预设失败");
    } finally { setSaving(false); }
  }

  return (
    <AdminShell title="Dashboard">
      <div className="p-5 sm:p-8">
        {error && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 border-l-4 border-red-600 bg-red-50 p-4 text-sm font-bold text-red-800"><span>{error}</span>{conflicted && <button onClick={() => void load()} className="border border-red-700 px-3 py-2">刷新最新版本</button>}</div>}
        {notice && <p role="status" className="mb-5 border-l-4 border-emerald-600 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{notice}</p>}
        {loading && <p className="py-20 text-center font-black text-neutral-500">正在加载活动状态…</p>}
        {!loading && data && draft && <>
          <section className="flex flex-wrap items-center justify-between gap-4 border border-[var(--orange)] bg-[var(--orange-soft)] p-5">
            <div><p className="text-xs font-black tracking-[.1em] text-[var(--orange)]">CURRENT PHASE</p><h2 className="mt-2 text-2xl font-black">● {data.phase}</h2></div>
            <div className="text-right text-xs text-neutral-600"><p>最后同步</p><p className="mt-1 font-black text-black">{data.lastSyncedAt ? new Date(data.lastSyncedAt).toLocaleString("zh-CN") : "尚未同步"}</p></div>
          </section>

          <section aria-labelledby="completion-heading" className="mt-8">
            <div className="flex items-end justify-between"><h2 id="completion-heading" className="text-lg font-black">完成率</h2><p className="text-xs text-neutral-500">仅 ACTIVE Learner / Senior Group（含 Counselor）</p></div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <MetricCard title="DAY 1 / SUBMITTED" value={data.completion.day1} />
              <MetricCard title="DAY 3 / SUBMITTED" value={data.completion.day3} />
              <article className="border border-neutral-300 bg-white p-5"><p className="text-xs font-black tracking-[.08em] text-neutral-500">有效账号</p><p className="mt-4 text-4xl font-black tracking-[-.06em]">{data.provisionedAccountCount}</p><p className="mt-7 text-xs text-neutral-500">仅统计 ACTIVE 账号，不含已归档账号</p></article>
            </div>
          </section>

          <section aria-labelledby="preset-heading" className="mt-10">
            <h2 id="preset-heading" className="text-lg font-black">QUICK PRESETS</h2>
            <p className="mt-2 text-sm text-neutral-600">预设组合由服务端维护；应用后仍可独立调整每个开关。</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{PRESETS.map((preset) => <button key={preset.id} disabled={saving} onClick={() => void applyPreset(preset)} className="group flex min-h-24 items-center justify-between border border-neutral-300 bg-white p-4 text-left hover:border-[var(--orange)]"><span><b className="block">{preset.label}</b><small className="mt-2 block text-neutral-500">{preset.note}</small></span><span className="text-3xl text-[var(--orange)] group-hover:translate-x-1">→</span></button>)}</div>
          </section>

          <section aria-labelledby="settings-heading" className="mt-10">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="settings-heading" className="text-lg font-black">INDEPENDENT SWITCHES</h2><p className="mt-2 text-sm text-neutral-600">所有开关均为高风险设置，保存前必须确认。</p></div><span className="border border-neutral-300 bg-white px-3 py-2 font-mono text-xs">version {data.settings.version}</span></div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">{SETTING_LABELS.map(({ key, label, note }) => <button key={key} type="button" aria-pressed={draft[key]} onClick={() => setDraft((current) => current ? { ...current, [key]: !current[key] } : current)} className="flex min-h-24 items-center justify-between gap-5 border border-neutral-300 bg-white p-4 text-left"><span><b className="block">{label}</b><small className="mt-2 block leading-5 text-neutral-500">{note}</small></span><span aria-hidden="true" className={`h-7 w-12 shrink-0 rounded-full p-1 ${draft[key] ? "bg-[var(--orange)]" : "bg-neutral-300"}`}><i className={`block h-5 w-5 rounded-full bg-white transition-transform ${draft[key] ? "translate-x-5" : ""}`} /></span></button>)}</div>
            <div className="sticky bottom-0 mt-5 flex flex-wrap items-center justify-between gap-4 border border-neutral-300 bg-white p-4 shadow-[0_-8px_30px_rgb(0_0_0/.08)]"><p className="text-sm font-bold">{dirtyCount ? `${dirtyCount} 项更改尚未保存` : "设置已与服务端同步"}</p><button onClick={() => void saveSettings()} disabled={!dirtyCount || saving} className="ow-btn !min-h-11 !w-auto px-7">{saving ? "保存中…" : "保存更改"}</button></div>
          </section>
        </>}
      </div>
    </AdminShell>
  );
}
