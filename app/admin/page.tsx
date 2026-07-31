"use client";

import { useEffect, useMemo, useState } from "react";

type View = "dashboard" | "accounts" | "audit" | "settings";
type Person = { id: string; code: string; username: string; chineseName: string | null; englishName: string | null; role: string; groupName: string | null; day1SubmittedAt: string | null; day3SubmittedAt: string | null; updatedAt: string };
const ORANGE = "#ff5311";

function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setLoading(true); const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }); if (response.ok) onLogin(); else setError("管理口令错误"); setLoading(false); }
  const localAdminPassword = process.env.NODE_ENV === "development" ? process.env.NEXT_PUBLIC_LOCAL_ADMIN_PASSWORD : undefined;
  return <main className="flex min-h-svh items-center justify-center bg-[var(--paper)] p-5"><form onSubmit={submit} className="w-full max-w-sm border-[1.5px] border-black bg-white p-8"><h1 className="text-3xl font-black">O—WEEK / ADMIN</h1>{localAdminPassword && <section className="mt-6 border-[1.5px] border-[var(--orange)] bg-[var(--orange-soft)] p-4 text-sm"><p className="font-black text-[var(--orange)]">本地管理员凭据</p><p className="mt-3"><span className="font-bold">账号：</span>无需账号（共享口令登录）</p><p className="mt-1 break-all"><span className="font-bold">密码：</span><code>{localAdminPassword}</code></p><p className="mt-3 text-xs text-neutral-600">仅在开发环境显示，生产环境不会输出。</p></section>}<label className="mt-8 block font-bold">管理口令<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 min-h-12 w-full border-[1.5px] border-black px-3 text-base" /></label>{error && <p className="mt-3 text-red-600">{error}</p>}<button disabled={loading || !password} className="ow-btn mt-6">{loading ? "验证中…" : "登录"}</button></form></main>;
}

function Shell({ view, setView, children, logout }: { view: View; setView: (view: View) => void; children: React.ReactNode; logout: () => void }) {
  return <div className="min-h-svh bg-[var(--paper)] lg:grid lg:grid-cols-[180px_1fr]"><aside className="bg-[#0b0b0a] p-5 text-white lg:min-h-svh"><h1 className="text-2xl font-black">O—WEEK/<br /><span style={{ color: ORANGE }}>2026</span></h1><nav className="mt-10 flex gap-2 overflow-auto lg:flex-col">{([['dashboard','DASHBOARD'],['accounts','ACCOUNTS'],['audit','AUDIT LOG'],['settings','EVENT SETTINGS']] as [View,string][]).map(([id,label]) => <button key={id} onClick={() => setView(id)} className={`min-h-11 whitespace-nowrap text-left text-xs font-black ${view === id ? "text-white" : "text-neutral-400"}`}>{label}</button>)}</nav><button onClick={logout} className="mt-8 text-xs font-bold text-[var(--orange)] lg:fixed lg:bottom-7">退出登录</button></aside><main className="min-w-0"><header className="flex min-h-16 items-center justify-between border-b border-neutral-300 bg-white px-6"><h2 className="text-2xl font-black capitalize">{view === "settings" ? "Dashboard" : view}</h2><div className="flex items-center gap-4"><a href="/home" target="_blank" className="text-xs font-bold text-[var(--orange)]">预览前台</a><span className="text-xs text-neutral-500">最后同步：本次页面加载</span></div></header>{children}</main></div>;
}

function Dashboard({ people, refresh }: { people: Person[]; refresh: () => void }) {
  const day1 = people.filter((person) => person.day1SubmittedAt).length; const day3 = people.filter((person) => person.day3SubmittedAt).length;
  return <div className="p-6"><div className="border border-[var(--orange)] bg-[var(--orange-soft)] p-4 font-black">● 当前阶段：DAY 3 创作</div><div className="mt-6 grid gap-4 md:grid-cols-3">{[["DAY 1 完成",day1],["DAY 3 完成",day3],["已配置账号",people.length]].map(([label,value]) => <div key={String(label)} className="bg-white p-5"><small>{label}</small><b className="mt-3 block text-3xl">{value} / {people.length}</b><div className="mt-4 h-1 bg-neutral-200"><span className="block h-full bg-[var(--orange)]" style={{ width: `${people.length ? Number(value) / people.length * 100 : 0}%` }} /></div></div>)}</div><h3 className="mt-8 font-black">QUICK PRESETS</h3><div className="mt-4 grid gap-4 md:grid-cols-3">{["DAY 1 创作","DAY 3 创作","活动前浏览","游戏进行","找礼包"].map((preset) => <button key={preset} onClick={() => void applyPreset(preset, refresh)} className="flex min-h-20 items-center justify-between border border-neutral-200 bg-white p-4 text-left font-black">{preset}<span className="text-2xl text-[var(--orange)]">→</span></button>)}</div><h3 className="mt-8 font-black">INDEPENDENT SWITCHES</h3><SettingsGrid refresh={refresh} /></div>;
}

async function applyPreset(name: string, refresh: () => void) {
  const values: Record<string, string> =
    name === "DAY 1 创作" ? { day1Open: "true", day3Open: "false", allowEdit: "false", navEnabled: "false" }
    : name === "DAY 3 创作" ? { day1Open: "false", day3Open: "true", allowEdit: "false", navEnabled: "false" }
    : name === "游戏进行" ? { day1Open: "true", day3Open: "true", navEnabled: "true", showNames: "false" }
    : name === "找礼包" ? { showNames: "true", profileComplete: "false", navEnabled: "false" }
    : { navEnabled: "true" };
  await Promise.all(Object.entries(values).map(([key, value]) => fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) })));
  refresh();
}

function SettingsGrid({ refresh }: { refresh: () => void }) {
  const [settings, setSettings] = useState<Record<string,string>>({});
  useEffect(() => { fetch("/api/admin/settings").then((r) => r.json()).then(setSettings).catch(() => {}); }, []);
  const options = [
    ["day1Open","Day 1 开放","未提交用户可进入编辑器"],
    ["day3Open","Day 3 开放","未提交用户可进入编辑器"],
    ["allowEdit","允许编辑","已提交作品可重新编辑"],
    ["showNames","显示姓名","关闭后全站使用匿名符号 ID"],
    ["profileComplete","显示完整资料","关闭后详情页返回身份标题"],
    ["navEnabled","目录与跨页导航","关闭后隐藏 Browse / 搜索，NFC 直达不受影响"],
  ];
  async function toggle(key: string) { const value = settings[key] === "true" ? "false" : "true"; setSettings((current) => ({ ...current, [key]: value })); await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) }); refresh(); }
  return <div className="mt-4 grid gap-4 md:grid-cols-2">{options.map(([key,label,description]) => <button key={key} onClick={() => toggle(key)} className="flex min-h-20 items-center justify-between bg-white p-4 text-left"><span><b>{label}</b><small className="mt-2 block text-neutral-500">{description}</small></span><span className={`h-6 w-11 rounded-full p-1 ${settings[key] === "true" ? "bg-[var(--orange)]" : "bg-neutral-300"}`}><i className={`block h-4 w-4 rounded-full bg-white transition-transform ${settings[key] === "true" ? "translate-x-5" : ""}`} /></span></button>)}</div>;
}

function ImportDialog({ close, refresh }: { close: () => void; refresh: () => void }) {
  const [text, setText] = useState(""); const [loading, setLoading] = useState(false); const [result, setResult] = useState<{ chineseName: string; username: string; password: string }[]>([]); const [error, setError] = useState("");
  async function submit() { setLoading(true); setError(""); const rows = text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => { const [chineseName = "", englishName = "", groupName = "", role = "LEARNER", username] = line.split(/[\t,]/).map((value) => value.trim()); return { chineseName, englishName, groupName, role: role.toUpperCase(), username: username || undefined }; }); const response = await fetch("/api/admin/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) }); const data = await response.json().catch(() => ({})); if (!response.ok) setError(data.error || "导入失败"); else { setResult(data.created || []); refresh(); } setLoading(false); }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"><section className="w-full max-w-2xl bg-white p-6"><div className="flex justify-between"><h2 className="text-2xl font-black">导入账号</h2><button onClick={close} className="h-11 w-11 text-3xl text-[var(--orange)]">×</button></div>{result.length === 0 ? <><p className="mt-4 text-sm text-neutral-500">每行：中文名,英文名,组别,角色,可选用户名</p><textarea value={text} onChange={(event) => setText(event.target.value)} rows={10} className="mt-4 w-full border-[1.5px] border-black p-3" placeholder="林若安,Ruoan,Group 02,LEARNER" />{error && <p className="mt-3 text-red-600">{error}</p>}<button onClick={submit} disabled={loading || !text.trim()} className="ow-btn mt-5">{loading ? "导入中…" : "确认导入"}</button></> : <><p className="mt-4 font-bold text-emerald-700">成功导入 {result.length} 个账号。密码仅显示一次。</p><div className="mt-4 max-h-80 overflow-auto border border-neutral-300">{result.map((account) => <div key={account.username} className="grid grid-cols-3 border-b p-3 text-sm"><b>{account.chineseName}</b><span>{account.username}</span><code>{account.password}</code></div>)}</div><button onClick={close} className="ow-btn mt-5">完成</button></>}</section></div>;
}

function Accounts({ people, refresh }: { people: Person[]; refresh: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Person | null>(null);
  const [importing, setImporting] = useState(false);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");

  const filtered = useMemo(
    () => people.filter((person) => `${person.chineseName}${person.englishName}${person.username}${person.groupName}`.toLowerCase().includes(query.toLowerCase())),
    [people, query]
  );

  async function copyPassword(password: string, name: string) {
    try {
      await navigator.clipboard.writeText(password);
      setFeedback(`${name} 的新密码已复制。`);
    } catch {
      setFeedback(`无法自动复制 ${name} 的新密码，请手动复制当前显示内容。`);
    }
  }

  async function resetAndCopy(person: Person) {
    const name = person.chineseName || person.englishName || person.username;
    if (!window.confirm(`确定重置 ${name} 的密码吗？旧密码将立即失效。`)) return;

    setResettingId(person.id);
    setFeedback("");
    try {
      const response = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: person.code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.password !== "string") {
        setFeedback(data.error || `无法重置 ${name} 的密码。`);
        return;
      }

      setPasswords((current) => ({ ...current, [person.id]: data.password }));
      await copyPassword(data.password, name);
    } catch {
      setFeedback(`无法连接服务器，${name} 的密码未被确认重置。`);
    } finally {
      setResettingId(null);
    }
  }

  return <div className="p-6"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-neutral-500">{people.length} 个账号</p><div className="flex flex-wrap gap-2"><a href="/api/admin/export" className="ow-btn ow-btn-outline !min-h-11 !w-auto text-xs">导出 CSV</a><a href="/api/admin/qr/print" target="_blank" className="ow-btn ow-btn-outline !min-h-11 !w-auto text-xs">打印 QR</a><button onClick={() => setImporting(true)} className="ow-btn !min-h-11 !w-auto text-xs">同步 / 导入账号</button></div></div><p aria-live="polite" className="mt-3 min-h-5 text-sm text-neutral-600">{feedback}</p><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索姓名、邮箱、组别或短码" className="mt-1 min-h-11 w-full max-w-md border border-neutral-200 px-4" /><div className="mt-5 overflow-auto"><table className="w-full min-w-[980px] bg-white text-sm"><thead className="border-y border-black text-left"><tr>{["姓名","账号","角色","组别","DAY 1","DAY 3","最近更新","新密码","操作"].map((label) => <th key={label} className="p-4">{label}</th>)}</tr></thead><tbody>{filtered.map((person) => { const password = passwords[person.id]; const name = person.chineseName || person.englishName || person.username; return <tr key={person.id} className="border-b border-neutral-200"><td className="p-4 font-bold">{name}</td><td className="p-4">{person.username}</td><td className="p-4">{person.role}</td><td className="p-4">{person.groupName || "—"}</td><td className="p-4 text-emerald-700">{person.day1SubmittedAt ? "SUBMITTED" : "DRAFT"}</td><td className="p-4 text-[var(--orange)]">{person.day3SubmittedAt ? "SUBMITTED" : "DRAFT"}</td><td className="p-4">{new Date(person.updatedAt).toLocaleDateString("zh-CN")}</td><td className="p-4">{password ? <div className="flex min-w-48 items-center gap-2"><code className="rounded bg-[var(--orange-soft)] px-2 py-1 font-bold">{password}</code><button type="button" onClick={() => void copyPassword(password, name)} className="min-h-9 border border-black px-2 text-xs font-bold">复制</button></div> : <button type="button" onClick={() => void resetAndCopy(person)} disabled={resettingId === person.id} className="min-h-9 border border-black px-3 text-xs font-bold disabled:opacity-50">{resettingId === person.id ? "重置中…" : "重置并复制"}</button>}</td><td className="p-4"><button onClick={() => setSelected(person)} className="min-h-11 px-3 text-xl">•••</button></td></tr>; })}</tbody></table></div>{selected && <AccountDrawer person={selected} close={() => setSelected(null)} refresh={refresh} />}{importing && <ImportDialog close={() => setImporting(false)} refresh={refresh} />}</div>;
}

function AccountDrawer({ person, close, refresh }: { person: Person; close: () => void; refresh: () => void }) {
  const [name, setName] = useState(person.chineseName || ""); const [role, setRole] = useState(person.role); const [groupName, setGroupName] = useState(person.groupName || "");
  async function save() { await fetch("/api/admin/persons", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: person.id, chineseName: name, role, groupName }) }); refresh(); close(); }
  async function remove() { if (!confirm("永久删除该账号？")) return; await fetch(`/api/admin/persons?id=${person.id}`, { method: "DELETE" }); refresh(); close(); }
  async function resetPassword() { const response = await fetch("/api/admin/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: person.code }) }); const data = await response.json(); if (response.ok) prompt("新密码（仅显示一次），请复制：", data.password); }
  return <div className="fixed inset-0 z-50 bg-black/30" onClick={close}><aside className="ml-auto flex h-full w-full max-w-md flex-col overflow-auto bg-white p-6" onClick={(event) => event.stopPropagation()}><div className="flex justify-between"><h2 className="text-2xl font-black">编辑账号</h2><button onClick={close} className="h-11 w-11 text-3xl text-[var(--orange)]">×</button></div><label className="mt-8 text-sm font-bold">姓名<input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 min-h-11 w-full border border-neutral-300 px-3" /></label><p className="mt-5 text-sm font-bold">角色</p><div className="mt-2 grid grid-cols-3 gap-2">{["LEARNER","SENIOR","ADMIN"].map((value) => <button key={value} onClick={() => setRole(value)} className={`ow-chip px-2 text-xs ${role === value ? "ow-chip-active" : ""}`}>{value}</button>)}</div><label className="mt-5 text-sm font-bold">组别<input value={groupName} onChange={(e) => setGroupName(e.target.value)} className="mt-2 min-h-11 w-full border border-neutral-300 px-3" /></label><div className="mt-8 bg-[var(--paper)] p-5"><b>提交状态</b><p className="mt-3 text-sm">DAY 1　{person.day1SubmittedAt ? "SUBMITTED" : "DRAFT"}</p><p className="mt-2 text-sm">DAY 3　{person.day3SubmittedAt ? "SUBMITTED" : "DRAFT"}</p></div><button onClick={resetPassword} className="mt-5 border border-black p-4 text-left font-bold">重置密码</button><button onClick={remove} className="mt-3 border border-[var(--orange)] bg-[var(--orange-soft)] p-5 text-left font-bold text-[var(--orange)]">删除账号</button><div className="mt-auto grid grid-cols-2 gap-3 pt-8"><button onClick={close} className="ow-btn ow-btn-outline">取消</button><button onClick={save} className="ow-btn">保存账号</button></div></aside></div>;
}

export default function AdminPage() {
  const [checking, setChecking] = useState(true); const [authed, setAuthed] = useState(false); const [view, setView] = useState<View>("dashboard"); const [people, setPeople] = useState<Person[]>([]); const [version, setVersion] = useState(0);
  useEffect(() => { fetch("/api/admin/session").then((r) => r.json()).then((data) => setAuthed(Boolean(data.authed))).finally(() => setChecking(false)); }, []);
  useEffect(() => { if (authed) fetch("/api/admin/persons").then((r) => r.json()).then((data) => setPeople(data.persons || [])).catch(() => {}); }, [authed, version]);
  if (checking) return <div className="flex min-h-svh items-center justify-center">加载中…</div>;
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;
  async function logout() { await fetch("/api/admin/logout", { method: "POST" }); setAuthed(false); }
  const content = view === "accounts" ? <Accounts people={people} refresh={() => setVersion((value) => value + 1)} /> : view === "audit" ? <div className="p-6"><div className="bg-white p-8"><h3 className="text-xl font-black">AUDIT LOG</h3><p className="mt-4 text-neutral-500">账号与活动开关操作会记录在服务端日志中。</p></div></div> : view === "settings" ? <div className="p-6"><SettingsGrid refresh={() => setVersion((value) => value + 1)} /></div> : <Dashboard people={people} refresh={() => setVersion((value) => value + 1)} />;
  return <Shell view={view} setView={setView} logout={logout}>{content}</Shell>;
}
