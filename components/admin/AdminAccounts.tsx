"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell from "./AdminShell";
import {
  adminApi,
  AdminApiError,
  isProtectedInitialAdmin,
  newIdempotencyKey,
  type AccountPage,
  type AdminAccount,
  type BulkResult,
  type Credential,
  type ImportResult,
  type SubmissionStatus,
  type UserRole,
} from "./admin-api";

const ROLES: UserRole[] = ["LEARNER", "SENIOR", "COUNSELOR", "ADMIN"];
const DAY_STATES: SubmissionStatus[] = ["NOT_STARTED", "DRAFT", "SUBMITTED"];

function csvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function credentialLine(item: Credential) {
  return `${item.displayName}\t${item.accountCode}\t${item.initialPassword}`;
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

function CredentialsDialog({ credentials, close }: { credentials: Credential[]; close: () => void }) {
  const [notice, setNotice] = useState("");

  async function copy(value: string, message: string) {
    try { await copyText(value); setNotice(message); }
    catch { setNotice("浏览器未允许自动复制，请手动选择内容。"); }
  }

  function download() {
    const csv = ["displayName,accountCode,initialPassword", ...credentials.map((item) => [item.displayName, item.accountCode, item.initialPassword].map(csvCell).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `oweek-credentials-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    URL.revokeObjectURL(url);
    setNotice("凭据 CSV 已下载。请将文件保存在受控位置。");
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/55 p-4" role="dialog" aria-modal="true" aria-labelledby="credentials-title">
      <section className="mx-auto my-6 w-full max-w-4xl border-[1.5px] border-black bg-white p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black tracking-[.12em] text-[var(--orange)]">ONE-TIME CREDENTIALS</p><h2 id="credentials-title" className="mt-2 text-3xl font-black">账号已创建</h2></div><button onClick={close} aria-label="关闭" className="h-11 w-11 text-3xl text-[var(--orange)]">×</button></div>
        <p className="mt-5 border-l-4 border-amber-500 bg-amber-50 p-4 text-sm font-bold text-amber-900">初始密码仅在当前页面内存中显示。关闭或刷新后无法再次查看；需要重新分发时必须重置密码。</p>
        <div className="mt-5 flex flex-wrap gap-3"><button onClick={() => void copy(credentials.map(credentialLine).join("\n"), `已复制 ${credentials.length} 行凭据。`)} className="ow-btn !min-h-11 !w-auto">复制全部</button><button onClick={download} className="ow-btn ow-btn-outline !min-h-11 !w-auto">下载凭据 CSV</button></div>
        <p aria-live="polite" className="mt-3 min-h-5 text-sm font-bold text-emerald-700">{notice}</p>
        <div className="mt-3 overflow-x-auto border border-neutral-300"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-black text-white"><tr><th className="p-3">姓名</th><th className="p-3">账号编号</th><th className="p-3">初始密码</th><th className="p-3">复制</th></tr></thead><tbody>{credentials.map((item) => <tr key={item.accountCode} className="border-b border-neutral-200"><td className="p-3 font-bold">{item.displayName}</td><td className="p-3 font-mono">{item.accountCode}</td><td className="p-3 font-mono font-bold text-[var(--orange)]">{item.initialPassword}</td><td className="p-3"><div className="flex gap-2"><button onClick={() => void copy(item.initialPassword, `已复制 ${item.displayName} 的密码。`)} className="min-h-10 border border-black px-3 font-bold">密码</button><button onClick={() => void copy(credentialLine(item), `已复制 ${item.displayName} 的整行凭据。`)} className="min-h-10 border border-black px-3 font-bold">整行</button></div></td></tr>)}</tbody></table></div>
        <button onClick={close} className="ow-btn mt-6">我已安全保存，关闭</button>
      </section>
    </div>
  );
}

function ImportDialog({ close, done }: { close: () => void; done: (credentials: Credential[]) => void }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const rows = useMemo(() => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => ({ displayName: line.split(/[\t,]/)[0]?.trim() || "" })).filter((row) => row.displayName && row.displayName.toLowerCase() !== "displayname"), [text]);

  async function submit() {
    if (!rows.length) return;
    setLoading(true); setError("");
    try {
      const result = await adminApi<ImportResult>("/accounts/import", { method: "POST", body: JSON.stringify({ rows, idempotencyKey: newIdempotencyKey() }) });
      done(result.credentials);
    } catch (cause) { setError(cause instanceof AdminApiError ? cause.message : "导入失败"); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <section className="w-full max-w-2xl border-[1.5px] border-black bg-white p-6">
        <div className="flex justify-between"><div><p className="text-xs font-black tracking-[.12em] text-[var(--orange)]">IMPORT / DEFAULT LEARNER</p><h2 id="import-title" className="mt-2 text-3xl font-black">导入用户</h2></div><button onClick={close} className="h-11 w-11 text-3xl text-[var(--orange)]">×</button></div>
        <p className="mt-5 text-sm leading-6 text-neutral-600">每行只需一个姓名。所有账号固定以 LEARNER 创建，之后可在 Accounts 中调整角色。</p>
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows={10} className="mt-4 w-full border-[1.5px] border-black p-3" placeholder={"张三\nAlice Chen\n王小明"} />
        <p className="mt-2 text-xs font-bold text-neutral-500">已识别 {rows.length} 个用户 · 本批次全有或全无</p>
        {error && <p role="alert" className="mt-4 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
        <div className="mt-6 grid grid-cols-2 gap-3"><button onClick={close} className="ow-btn ow-btn-outline">取消</button><button onClick={() => void submit()} disabled={loading || !rows.length} className="ow-btn">{loading ? "导入中…" : `创建 ${rows.length} 个账号`}</button></div>
      </section>
    </div>
  );
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { cells.push(value.trim()); value = ""; }
    else value += char;
  }
  cells.push(value.trim());
  return cells;
}

function EmailImportDialog({ close, done }: { close: () => void; done: (message: string) => void }) {
  const [text, setText] = useState("accountCode,displayName,email\n");
  const [loading, setLoading] = useState(false);
  const [previewed, setPreviewed] = useState(false);
  const [error, setError] = useState("");
  const rows = useMemo(() => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(parseCsvLine).filter((cells, index) => !(index === 0 && cells[0]?.toLowerCase() === "accountcode")).map((cells) => ({ accountCode: cells[0] || "", displayName: cells[1] || "", email: cells[2] || "" })), [text]);

  function describeConflict(cause: AdminApiError) {
    const conflicts = Array.isArray(cause.details?.conflicts) ? cause.details.conflicts as Array<{ row?: number; accountCode?: string; code?: string }> : [];
    return conflicts.length
      ? conflicts.map((item) => `第 ${item.row ?? "?"} 行 ${item.accountCode || "（无编号）"}：${item.code || "冲突"}`).join("\n")
      : cause.message;
  }

  async function preview() {
    setLoading(true); setError(""); setPreviewed(false);
    try {
      await adminApi("/accounts/import-emails", { method: "POST", body: JSON.stringify({ rows, dryRun: true }) });
      setPreviewed(true);
    } catch (cause) { setError(cause instanceof AdminApiError ? describeConflict(cause) : "预检失败"); }
    finally { setLoading(false); }
  }

  async function apply() {
    if (!previewed) return;
    setLoading(true); setError("");
    try {
      const result = await adminApi<{ rowCount: number; updatedCount: number; unchangedCount: number }>("/accounts/import-emails", { method: "POST", body: JSON.stringify({ rows, confirm: true, idempotencyKey: newIdempotencyKey() }) });
      done(`邮箱导入完成：更新 ${result.updatedCount}，保持不变 ${result.unchangedCount}。`);
    } catch (cause) { setPreviewed(false); setError(cause instanceof AdminApiError ? describeConflict(cause) : "邮箱导入失败"); }
    finally { setLoading(false); }
  }

  async function loadFile(file?: File) {
    if (!file) return;
    setText(await file.text()); setPreviewed(false); setError("");
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-labelledby="email-import-title">
      <section className="w-full max-w-3xl border-[1.5px] border-black bg-white p-6">
        <div className="flex justify-between"><div><p className="text-xs font-black tracking-[.12em] text-[var(--orange)]">SSO PRE-PROVISIONING</p><h2 id="email-import-title" className="mt-2 text-3xl font-black">批量补录学校邮箱</h2></div><button onClick={close} className="h-11 w-11 text-3xl text-[var(--orange)]">×</button></div>
        <p className="mt-5 text-sm leading-6 text-neutral-600">CSV 列顺序固定为 accountCode, displayName, email。账号编号是唯一匹配键；姓名仅用于核对。任何一行冲突时整批不会写入。</p>
        <input type="file" accept=".csv,text/csv" onChange={(event) => void loadFile(event.target.files?.[0])} className="mt-4 block w-full text-sm" />
        <textarea value={text} onChange={(event) => { setText(event.target.value); setPreviewed(false); }} rows={10} className="mt-4 w-full border-[1.5px] border-black p-3 font-mono text-sm" />
        <p className="mt-2 text-xs font-bold text-neutral-500">已识别 {rows.length} 行 · {previewed ? "预检通过，可以确认写入" : "尚未通过预检"}</p>
        {error && <pre role="alert" className="mt-4 max-h-36 overflow-auto whitespace-pre-wrap bg-red-50 p-3 text-sm font-bold text-red-700">{error}</pre>}
        <div className="mt-6 grid grid-cols-3 gap-3"><button onClick={close} className="ow-btn ow-btn-outline">取消</button><button onClick={() => void preview()} disabled={loading || !rows.length} className="ow-btn ow-btn-outline">{loading ? "处理中…" : "1. 预检冲突"}</button><button onClick={() => void apply()} disabled={loading || !previewed} className="ow-btn">2. 确认导入</button></div>
      </section>
    </div>
  );
}

function AccountDrawer({ account, groups, close, saved }: { account: AdminAccount; groups: AccountPage["groups"]; close: () => void; saved: () => void }) {
  const protectedAdmin = isProtectedInitialAdmin(account);
  const [displayName, setDisplayName] = useState(account.displayName);
  const [role, setRole] = useState(account.role);
  const [groupId, setGroupId] = useState(account.groupId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newPassword, setNewPassword] = useState("");

  async function save() {
    if (!displayName.trim() || protectedAdmin) return;
    setSaving(true); setError("");
    try {
      await adminApi(`/accounts/${encodeURIComponent(account.id)}`, { method: "PATCH", body: JSON.stringify({ version: account.version, displayName: displayName.trim(), role, groupId: groupId || null, confirm: true, idempotencyKey: newIdempotencyKey() }) });
      saved(); close();
    } catch (cause) { setError(cause instanceof AdminApiError ? cause.message : "保存账号失败"); }
    finally { setSaving(false); }
  }

  async function resetPassword() {
    if (protectedAdmin || !window.confirm(`重置 ${account.displayName} 的密码？旧密码和所有现有会话将立即失效。`)) return;
    setError("");
    try {
      const result = await adminApi<{ accountCode: string; initialPassword: string }>(`/accounts/${encodeURIComponent(account.id)}/reset-password`, { method: "POST", body: JSON.stringify({ version: account.version, confirm: true, idempotencyKey: newIdempotencyKey() }) });
      setNewPassword(result.initialPassword);
    } catch (cause) { setError(cause instanceof AdminApiError ? cause.message : "重置密码失败"); }
  }

  async function archive() {
    if (protectedAdmin || !window.confirm(`归档 ${account.displayName}？该账号将立即无法登录，也不会出现在 Gallery。`)) return;
    setError("");
    try {
      await adminApi<BulkResult>("/accounts/bulk", { method: "POST", body: JSON.stringify({ accountIds: [account.id], operation: "ARCHIVE", confirm: true, idempotencyKey: newIdempotencyKey() }) });
      saved(); close();
    } catch (cause) { setError(cause instanceof AdminApiError ? cause.message : "归档账号失败"); }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/45" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onClick={close}>
      <aside className="ml-auto flex h-full w-full max-w-lg flex-col overflow-y-auto border-l-[1.5px] border-black bg-white p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between"><div><p className="font-mono text-xs font-bold text-[var(--orange)]">{account.accountCode}</p><h2 id="drawer-title" className="mt-2 text-3xl font-black">Account Drawer</h2></div><button onClick={close} aria-label="关闭" className="h-11 w-11 text-3xl text-[var(--orange)]">×</button></div>
        {protectedAdmin && <div className="mt-5 border border-[var(--orange)] bg-[var(--orange-soft)] p-4"><b>系统初始 Admin · 受保护</b><p className="mt-2 text-sm">SophiaXu 的姓名、角色和密码不可修改，账号不可降级、归档或删除。</p></div>}
        <label className="mt-6 text-sm font-black">姓名<input value={displayName} disabled={protectedAdmin} onChange={(event) => setDisplayName(event.target.value)} className="mt-2 min-h-11 w-full border border-neutral-400 px-3 disabled:bg-neutral-100" /></label>
        <label className="mt-5 text-sm font-black">邮箱（只读）<input value={account.email ?? "尚未补录"} readOnly className="mt-2 min-h-11 w-full border border-neutral-300 bg-neutral-100 px-3 text-neutral-600" /></label>
        <div className="mt-5"><p className="text-sm font-black">角色</p><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{ROLES.map((value) => <button key={value} disabled={protectedAdmin} onClick={() => setRole(value)} className={`min-h-11 border px-2 text-xs font-black disabled:cursor-not-allowed ${role === value ? "border-[var(--orange)] bg-[var(--orange)]" : "border-neutral-400 bg-white"}`}>{value}</button>)}</div></div>
        <label className="mt-5 text-sm font-black">组别<select value={groupId} disabled={protectedAdmin} onChange={(event) => setGroupId(event.target.value)} className="mt-2 min-h-11 w-full border border-neutral-400 bg-white px-3 disabled:bg-neutral-100"><option value="">未分组</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <div className="mt-6 grid grid-cols-2 gap-3 bg-[var(--paper)] p-4 text-sm"><p><b>DAY 1</b><span className="mt-1 block">{account.day1Status}</span></p><p><b>DAY 3</b><span className="mt-1 block">{account.day3Status}</span></p><p><b>账号状态</b><span className="mt-1 block">{account.status}</span></p><p><b>匿名 ID</b><span className="mt-1 block font-mono">{account.anonymousId ?? "—"}</span></p><p><b>OIDC</b><span className="mt-1 block">{account.oidcBound ? "已绑定" : "未绑定"}</span></p><p><b>最近登录</b><span className="mt-1 block">{account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString("zh-CN") : "从未"}</span></p></div>
        {newPassword && <div className="mt-5 border border-emerald-500 bg-emerald-50 p-4"><b>新密码（仅显示一次）</b><div className="mt-2 flex items-center justify-between gap-3"><code className="break-all font-bold">{newPassword}</code><button onClick={() => void copyText(newPassword)} className="min-h-10 border border-black px-3 text-xs font-bold">复制</button></div></div>}
        {error && <p role="alert" className="mt-4 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
        <div className="mt-6 grid gap-3"><button disabled={protectedAdmin} onClick={() => void resetPassword()} className="min-h-12 border border-black p-3 text-left font-black disabled:bg-neutral-100 disabled:text-neutral-400">重置密码 <span className="float-right">→</span></button><button disabled={protectedAdmin || account.status === "ARCHIVED"} onClick={() => void archive()} className="min-h-12 border border-red-600 p-3 text-left font-black text-red-700 disabled:border-neutral-300 disabled:bg-neutral-100 disabled:text-neutral-400">归档账号 <span className="float-right">→</span></button></div>
        <div className="mt-auto grid grid-cols-2 gap-3 pt-8"><button onClick={close} className="ow-btn ow-btn-outline">取消</button><button disabled={saving || protectedAdmin || !displayName.trim()} onClick={() => void save()} className="ow-btn">{saving ? "保存中…" : "保存账号"}</button></div>
      </aside>
    </div>
  );
}

export default function AdminAccounts() {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [groups, setGroups] = useState<AccountPage["groups"]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState(""); const [group, setGroup] = useState("");
  const [day1, setDay1] = useState(""); const [day3, setDay3] = useState(""); const [sort, setSort] = useState("name_asc");
  const [hideArchived, setHideArchived] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<AdminAccount | null>(null);
  const [importing, setImporting] = useState(false);
  const [importingEmails, setImportingEmails] = useState(false);
  const [credentials, setCredentials] = useState<Credential[] | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [groupBusy, setGroupBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");

  const load = useCallback(async (cursor?: string, append = false) => {
    setLoading(true); setError("");
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim()); if (role) params.set("role", role); if (group) params.set("groupId", group);
    if (day1) params.set("day1Status", day1); if (day3) params.set("day3Status", day3); if (sort) params.set("sort", sort);
    if (hideArchived) params.set("status", "ACTIVE"); if (cursor) params.set("cursor", cursor);
    try {
      type AccountResponse = AccountPage | {
        accounts: Array<Partial<AdminAccount> & Pick<AdminAccount, "id" | "accountCode" | "displayName" | "role" | "status" | "version"> & {
          submissions?: Array<{ section: "DAY1" | "DAY3"; status: SubmissionStatus }>;
        }>;
        groups?: AccountPage["groups"];
        nextCursor?: string | null;
      };
      const result = await adminApi<AccountResponse>(`/accounts?${params.toString()}`);
      const resultItems = "items" in result ? result.items : result.accounts.map((account) => ({
        ...account,
        email: account.email ?? null,
        groupId: account.groupId ?? null,
        groupName: account.groupName ?? null,
        lastLoginAt: account.lastLoginAt ?? null,
        day1Status: account.day1Status ?? account.submissions?.find((submission) => submission.section === "DAY1")?.status ?? "NOT_STARTED",
        day3Status: account.day3Status ?? account.submissions?.find((submission) => submission.section === "DAY3")?.status ?? "NOT_STARTED",
      }));
      setAccounts((current) => append ? [...current, ...resultItems] : resultItems);
      if (result.groups) setGroups(result.groups);
      else {
        const inferredGroups = [...new Map(
          resultItems
            .filter((account) => account.groupId)
            .map((account) => [account.groupId!, { id: account.groupId!, name: account.groupName ?? account.groupId!, memberCount: 0 }]),
        ).values()];
        setGroups(inferredGroups);
      }
      setNextCursor(result.nextCursor ?? null);
      if (!append) setSelected(new Set());
    } catch (cause) { setError(cause instanceof AdminApiError ? cause.message : "无法加载账号"); }
    finally { setLoading(false); }
  }, [day1, day3, group, hideArchived, query, role, sort]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timer); }, [load]);

  const selectable = accounts.filter((account) => !isProtectedInitialAdmin(account));
  const selectedAccounts = accounts.filter((account) => selected.has(account.id) && !isProtectedInitialAdmin(account));
  const selectedAreAllActive = selectedAccounts.length > 0 && selectedAccounts.every((account) => account.status === "ACTIVE");
  const selectedAreAllArchived = selectedAccounts.length > 0 && selectedAccounts.every((account) => account.status === "ARCHIVED");

  function toggleAll() {
    setSelected((current) => selectable.every((account) => current.has(account.id)) ? new Set() : new Set(selectable.map((account) => account.id)));
  }

  async function createGroup() {
    const name = newGroupName.trim();
    if (!name || !window.confirm(`创建组别「${name}」？`)) return;
    setCreatingGroup(true); setError(""); setNotice("");
    try {
      const result = await adminApi<{ group: AccountPage["groups"][number] }>("/groups", {
        method: "POST",
        body: JSON.stringify({ name, confirm: true, idempotencyKey: newIdempotencyKey() }),
      });
      setGroups((current) => [...current, result.group].sort((left, right) => left.name.localeCompare(right.name, "zh-CN")));
      setNewGroupName("");
      setNotice(`组别「${result.group.name}」已创建，现在可以为 Senior 和 Learner 分配该组。`);
    } catch (cause) {
      setError(cause instanceof AdminApiError ? cause.message : "创建组别失败");
    } finally { setCreatingGroup(false); }
  }

  async function renameGroup(groupId: string) {
    const name = editingGroupName.trim();
    if (!name) return;
    setGroupBusy(groupId); setError(""); setNotice("");
    try {
      const result = await adminApi<{ group: AccountPage["groups"][number] }>(`/groups/${encodeURIComponent(groupId)}`, { method: "PATCH", body: JSON.stringify({ name, confirm: true, idempotencyKey: newIdempotencyKey() }) });
      setGroups((current) => current.map((item) => item.id === groupId ? result.group : item).sort((left, right) => left.name.localeCompare(right.name, "zh-CN")));
      setEditingGroupId(null); setEditingGroupName(""); setNotice(`组别已重命名为「${result.group.name}」。`);
      await load();
    } catch (cause) { setError(cause instanceof AdminApiError ? cause.message : "重命名组别失败"); }
    finally { setGroupBusy(null); }
  }

  async function deleteGroup(item: AccountPage["groups"][number]) {
    if (!window.confirm(`删除组别「${item.name}」？\n\n${item.memberCount} 个成员会自动变为未分组；其中 Senior 在重新分组前将看不到 Learner。账号和作品不会被删除。`)) return;
    setGroupBusy(item.id); setError(""); setNotice("");
    try {
      const result = await adminApi<{ deletedGroupId: string; unassignedAccountCount: number }>(`/groups/${encodeURIComponent(item.id)}`, { method: "DELETE", body: JSON.stringify({ confirm: true, idempotencyKey: newIdempotencyKey() }) });
      setGroups((current) => current.filter((groupItem) => groupItem.id !== result.deletedGroupId));
      if (group === item.id) setGroup("");
      setEditingGroupId(null); setEditingGroupName(""); setNotice(`组别「${item.name}」已删除，${result.unassignedAccountCount} 个账号已转为未分组。`);
      await load();
    } catch (cause) { setError(cause instanceof AdminApiError ? cause.message : "删除组别失败"); }
    finally { setGroupBusy(null); }
  }

  async function bulk(operation: "SET_ROLE" | "SET_GROUP" | "ARCHIVE" | "PURGE_ARCHIVED", value?: string) {
    if (!selectedAccounts.length) return;
    const summary = operation === "SET_ROLE"
      ? `把 ${selectedAccounts.length} 个账号修改为 ${value}`
      : operation === "SET_GROUP"
        ? `把 ${selectedAccounts.length} 个账号移动到指定组别`
        : operation === "PURGE_ARCHIVED"
          ? `永久清理 ${selectedAccounts.length} 个已归档账号`
          : `归档 ${selectedAccounts.length} 个账号；他们将立即无法登录`;
    const warning = operation === "PURGE_ARCHIVED"
      ? "账号、登录凭据、作品和图片都会永久删除，无法恢复。ACTIVE 账号不允许执行此操作。"
      : "系统初始 Admin 已自动排除。";
    if (!window.confirm(`${summary}？\n\n${warning}`)) return;
    setError(""); setNotice("");
    try {
      type BulkResponse = BulkResult | { affectedCount: number; excludedAccountIds: string[] };
      const result = await adminApi<BulkResponse>("/accounts/bulk", { method: "POST", body: JSON.stringify({ accountIds: selectedAccounts.map((account) => account.id), operation, payload: operation === "SET_ROLE" ? { role: value } : operation === "SET_GROUP" ? { groupId: value || null } : {}, confirm: true, idempotencyKey: newIdempotencyKey() }) });
      if ("affectedCount" in result) setNotice(`批量操作完成：成功 ${result.affectedCount}，自动排除受保护账号 ${result.excludedAccountIds.length}。`);
      else setNotice(`批量操作完成：成功 ${result.succeeded}，失败 ${result.failed}。`);
      await load();
    } catch (cause) { setError(cause instanceof AdminApiError ? cause.message : "批量操作失败"); }
  }

  async function downloadSelectedExhibition() {
    if (!selectedAreAllActive) return;
    setError(""); setNotice("");
    try {
      const response = await fetch("/api/v1/admin/accounts/export-exhibition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ accountIds: selectedAccounts.map((account) => account.id) }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { message?: string }; requestId?: string } | null;
        throw new Error(`${body?.error?.message || "导出失败"}${body?.requestId ? ` · ${body.requestId.slice(-8)}` : ""}`);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "oweek-nfc-exhibition-links.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setNotice(`已导出所选 ${selectedAccounts.length} 个 ACTIVE 账号的 NFC 展览网址。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导出 NFC 展览网址失败");
    }
  }

  return (
    <AdminShell title="Accounts">
      <div className="p-5 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-neutral-600">管理账号、角色、组别和提交状态</p><p className="mt-1 text-xs text-neutral-500">固定 SophiaXu Admin 会自动排除所有高风险操作。</p></div><div className="flex flex-wrap gap-3"><button onClick={() => setImportingEmails(true)} className="ow-btn ow-btn-outline !min-h-11 !w-auto">补录学校邮箱</button><button onClick={() => setImporting(true)} className="ow-btn !min-h-11 !w-auto">＋ 导入用户</button></div></div>
        {error && <p role="alert" className="mt-5 border-l-4 border-red-600 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}
        {notice && <p role="status" className="mt-5 border-l-4 border-emerald-600 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{notice}</p>}

        <form onSubmit={(event) => { event.preventDefault(); void createGroup(); }} className="mt-6 flex flex-wrap items-end gap-3 border border-neutral-300 bg-white p-4">
          <label className="min-w-56 flex-1 text-sm font-black">新建组别<input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} maxLength={80} placeholder="例如：Group A" className="mt-2 min-h-11 w-full border border-neutral-300 px-3" /></label>
          <button type="submit" disabled={creatingGroup || !newGroupName.trim()} className="ow-btn ow-btn-outline !min-h-11 !w-auto px-6">{creatingGroup ? "创建中…" : "＋ 创建组别"}</button>
        </form>
        {groups.length > 0 && <section aria-label="组别管理" className="border-x border-b border-neutral-300 bg-neutral-50 p-4"><p className="mb-3 text-xs font-black tracking-[.1em] text-neutral-500">GROUP MANAGEMENT</p><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{groups.map((item) => <div key={item.id} className="flex min-h-14 items-center gap-2 border border-neutral-300 bg-white p-2">{editingGroupId === item.id ? <><input autoFocus value={editingGroupName} maxLength={80} onChange={(event) => setEditingGroupName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void renameGroup(item.id); } if (event.key === "Escape") setEditingGroupId(null); }} aria-label={`编辑 ${item.name} 的名称`} className="min-h-10 min-w-0 flex-1 border border-black px-2" /><button disabled={groupBusy === item.id || !editingGroupName.trim()} onClick={() => void renameGroup(item.id)} className="min-h-10 border border-black px-3 text-xs font-black">保存</button><button onClick={() => setEditingGroupId(null)} className="min-h-10 px-2 text-xs font-bold">取消</button></> : <><span className="min-w-0 flex-1"><b className="block truncate">{item.name}</b><small className="text-neutral-500">{item.memberCount} 个成员</small></span><button onClick={() => { setEditingGroupId(item.id); setEditingGroupName(item.name); }} className="min-h-10 border border-black px-3 text-xs font-black">编辑</button><button disabled={groupBusy === item.id} onClick={() => void deleteGroup(item)} className="min-h-10 border border-red-600 px-3 text-xs font-black text-red-700">删除</button></>}</div>)}</div></section>}

        <section aria-label="账号筛选" className="mt-6 grid gap-3 border border-neutral-300 bg-white p-4 md:grid-cols-2 xl:grid-cols-6">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="姓名 / 邮箱 / 编号 / 组别" className="min-h-11 border border-neutral-300 px-3 xl:col-span-2" />
          <select value={role} onChange={(event) => setRole(event.target.value)} className="min-h-11 border border-neutral-300 bg-white px-3"><option value="">全部角色</option>{ROLES.map((value) => <option key={value}>{value}</option>)}</select>
          <select value={group} onChange={(event) => setGroup(event.target.value)} className="min-h-11 border border-neutral-300 bg-white px-3"><option value="">全部组别</option>{groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select value={day1} onChange={(event) => setDay1(event.target.value)} className="min-h-11 border border-neutral-300 bg-white px-3"><option value="">DAY 1 全部</option>{DAY_STATES.map((value) => <option key={value}>{value}</option>)}</select>
          <select value={day3} onChange={(event) => setDay3(event.target.value)} className="min-h-11 border border-neutral-300 bg-white px-3"><option value="">DAY 3 全部</option>{DAY_STATES.map((value) => <option key={value}>{value}</option>)}</select>
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="min-h-11 border border-neutral-300 bg-white px-3 xl:col-start-5"><option value="name_asc">姓名 A–Z</option><option value="name_desc">姓名 Z–A</option><option value="group_asc">组别</option><option value="last_login_desc">最近登录</option></select>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 border border-neutral-300 px-3 text-sm font-black">
            <input type="checkbox" checked={hideArchived} onChange={(event) => setHideArchived(event.target.checked)} className="h-4 w-4 accent-[var(--orange)]" />
            隐藏已归档账号
          </label>
        </section>

        <section className="mt-4 flex flex-wrap items-center gap-3 border border-[var(--orange)] bg-[var(--orange-soft)] p-4">
          <b className="mr-auto text-sm">已选择 {selectedAccounts.length} 个账号</b>
          <select aria-label="批量修改角色" defaultValue="" onChange={(event) => { if (event.target.value) void bulk("SET_ROLE", event.target.value); event.target.value = ""; }} disabled={!selectedAccounts.length} className="min-h-10 border border-black bg-white px-3 text-xs font-bold"><option value="">批量角色…</option>{ROLES.map((value) => <option key={value}>{value}</option>)}</select>
          <select aria-label="批量修改组别" defaultValue="" onChange={(event) => { if (event.target.value) void bulk("SET_GROUP", event.target.value); event.target.value = ""; }} disabled={!selectedAccounts.length} className="min-h-10 border border-black bg-white px-3 text-xs font-bold"><option value="">批量组别…</option>{groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <button disabled={!selectedAreAllActive} title={selectedAccounts.length && !selectedAreAllActive ? "NFC 网址只能导出 ACTIVE 账号" : undefined} onClick={() => void downloadSelectedExhibition()} className="min-h-10 border border-black bg-white px-3 text-xs font-black disabled:opacity-40">导出所选 NFC（{selectedAccounts.length}）</button>
          <button disabled={!selectedAccounts.length} onClick={() => void bulk("ARCHIVE")} className="min-h-10 border border-red-700 px-3 text-xs font-black text-red-700 disabled:opacity-40">批量归档</button>
          <button disabled={!selectedAreAllArchived} title={selectedAccounts.length && !selectedAreAllArchived ? "只能永久清理全部为 ARCHIVED 的所选账号" : undefined} onClick={() => void bulk("PURGE_ARCHIVED")} className="min-h-10 bg-red-700 px-3 text-xs font-black text-white disabled:bg-neutral-300">永久清理归档（{selectedAccounts.length}）</button>
        </section>

        <div className="mt-4 overflow-x-auto border border-neutral-300 bg-white"><table className="w-full min-w-[1120px] text-left text-sm"><thead className="bg-black text-white"><tr><th className="p-3"><input type="checkbox" aria-label="选择当前列表全部账号" checked={selectable.length > 0 && selectable.every((account) => selected.has(account.id))} onChange={toggleAll} /></th>{["姓名 / 编号","邮箱","角色","组别","DAY 1","DAY 3","最近登录","状态","操作"].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{accounts.map((account) => { const protectedAdmin = isProtectedInitialAdmin(account); return <tr key={account.id} className={`border-b border-neutral-200 ${account.status === "ARCHIVED" ? "bg-neutral-100 text-neutral-500" : ""}`}><td className="p-3"><input type="checkbox" disabled={protectedAdmin} checked={selected.has(account.id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(account.id)) next.delete(account.id); else next.add(account.id); return next; })} aria-label={`选择 ${account.displayName}`} /></td><td className="p-3"><div className="flex items-center gap-2"><b>{account.displayName}</b>{protectedAdmin && <span className="border border-[var(--orange)] bg-[var(--orange-soft)] px-2 py-1 text-[10px] font-black text-[var(--orange)]">系统初始 Admin</span>}</div><code className="mt-1 block text-xs text-neutral-500">{account.accountCode}</code></td><td className="p-3">{account.email ?? "—"}</td><td className="p-3 font-bold">{account.role}</td><td className="p-3">{account.groupName ?? "—"}</td><td className="p-3">{account.day1Status}</td><td className="p-3">{account.day3Status}</td><td className="p-3">{account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleDateString("zh-CN") : "从未"}</td><td className="p-3">{account.status}</td><td className="p-3"><button onClick={() => setDrawer(account)} className="min-h-10 border border-black px-3 font-black">编辑 →</button></td></tr>; })}</tbody></table>{!loading && accounts.length === 0 && <p className="p-10 text-center text-neutral-500">没有符合条件的账号</p>}{loading && <p className="p-6 text-center font-bold text-neutral-500">加载中…</p>}</div>
        {nextCursor && <button disabled={loading} onClick={() => void load(nextCursor, true)} className="ow-btn ow-btn-outline mt-4">加载更多</button>}
      </div>
      {importing && <ImportDialog close={() => setImporting(false)} done={(items) => { setImporting(false); setCredentials(items); void load(); }} />}
      {importingEmails && <EmailImportDialog close={() => setImportingEmails(false)} done={(message) => { setImportingEmails(false); setNotice(message); void load(); }} />}
      {credentials && <CredentialsDialog credentials={credentials} close={() => setCredentials(null)} />}
      {drawer && <AccountDrawer account={drawer} groups={groups} close={() => setDrawer(null)} saved={() => void load()} />}
    </AdminShell>
  );
}
