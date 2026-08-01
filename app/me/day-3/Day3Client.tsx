"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import StudentHeader from "@/components/student/StudentHeader";
import { PageError, PageLoading, SaveStatus } from "@/components/student/AsyncState";
import ViewportDialog from "@/components/student/ViewportDialog";
import ArtworkShareButton from "@/components/student/ArtworkShareButton";
import { describeApiError, isReadOnlyError, loginUrl, newIdempotencyKey, studentApi, StudentApiError, type SubmissionStatus } from "@/components/student/api";

interface BottleConfig { bottleKey: string; label: string; required: boolean; group?: string }
interface BottleValue { bottleKey: string; level: number | null; isConfirmed: boolean }
interface Day3Data { status: SubmissionStatus; version: number; canAuthor: boolean; readOnlyReason?: string; template: { templateVersion: string; bottles: BottleConfig[] }; bottles: BottleValue[]; publicId: string }

function normalizeDay3(raw: Day3Data): Day3Data {
  const value = raw as Day3Data & { submission?: Partial<Day3Data>; config?: Day3Data["template"]; templateVersion?: string };
  const submission = value.submission || value;
  const template = value.template || value.config || { templateVersion: value.templateVersion || "", bottles: [] };
  return { status: submission.status || "NOT_STARTED", version: submission.version || 1, canAuthor: submission.canAuthor ?? value.canAuthor ?? false, readOnlyReason: submission.readOnlyReason || value.readOnlyReason, template: { templateVersion: template.templateVersion || "", bottles: Array.isArray(template.bottles) ? template.bottles.map((bottle) => ({ ...bottle, required: bottle.required !== false })) : [] }, bottles: Array.isArray(submission.bottles) ? submission.bottles : [], publicId: submission.publicId || value.publicId || "" };
}

export default function Day3Client() {
  const router = useRouter();
  const [data, setData] = useState<Day3Data | null>(null);
  const [bottles, setBottles] = useState<BottleValue[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const version = useRef(1);
  const valuesRef = useRef<BottleValue[]>([]);
  const dirty = useRef(false);
  const revision = useRef(0);

  const load = useCallback(async () => {
    setError("");
    try {
      const next = normalizeDay3(await studentApi<Day3Data>("/api/v1/submissions/day3"));
      setData(next); setBottles(next.bottles); valuesRef.current = next.bottles; version.current = next.version; setReadOnly(!next.canAuthor || next.status === "SUBMITTED");
    } catch (caught) {
      if (caught instanceof StudentApiError && caught.status === 401) { router.replace(loginUrl("/me/day-3")); return; }
      setError(describeApiError(caught));
    }
  }, [router]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const saveDraft = useCallback(async (keepalive = false) => {
    if (!data || readOnly || !dirty.current) return true;
    const saveRevision = revision.current;
    const snapshot = valuesRef.current;
    setError("");
    setSaveState("saving");
    try {
      const response = await studentApi<{ version: number }>("/api/v1/submissions/day3/draft", { method: "PUT", keepalive, headers: { "Idempotency-Key": newIdempotencyKey() }, body: JSON.stringify({ version: version.current, templateVersion: data.template.templateVersion, bottles: snapshot }) });
      version.current = response.version;
      if (revision.current === saveRevision) { dirty.current = false; setSaveState("saved"); } else { dirty.current = true; setSaveState("dirty"); }
      return true;
    } catch (caught) { if (isReadOnlyError(caught)) setReadOnly(true); setSaveState("error"); setError(describeApiError(caught)); return false; }
  }, [data, readOnly]);
  useEffect(() => { if (saveState !== "dirty") return; const timer = window.setTimeout(() => void saveDraft(), 900); return () => window.clearTimeout(timer); }, [bottles, saveDraft, saveState]);
  useEffect(() => { const leave = () => { if (dirty.current) void saveDraft(true); }; const online = () => { if (dirty.current) void saveDraft(); }; const warn = (event: BeforeUnloadEvent) => { if (dirty.current) event.preventDefault(); }; window.addEventListener("pagehide", leave); window.addEventListener("online", online); window.addEventListener("beforeunload", warn); return () => { window.removeEventListener("pagehide", leave); window.removeEventListener("online", online); window.removeEventListener("beforeunload", warn); }; }, [saveDraft]);

  function setLevel(bottleKey: string, level: number) {
    if (readOnly) return;
    const bounded = Math.max(0, Math.min(5, Math.round(level)));
    setBottles((current) => {
      const value = { bottleKey, level: bounded, isConfirmed: true };
      const next = current.some((item) => item.bottleKey === bottleKey) ? current.map((item) => item.bottleKey === bottleKey ? value : item) : [...current, value];
      valuesRef.current = next; return next;
    });
    revision.current += 1; dirty.current = true; setSaveState("dirty"); setMissing((current) => current.filter((key) => key !== bottleKey));
  }

  async function reopenSubmission() {
    if (!data || data.status !== "SUBMITTED" || !data.canAuthor || !window.confirm("重新编辑会把已提交作品恢复为草稿。在再次提交前，Gallery 中不会展示未提交的改动。")) return;
    setReopening(true); setError("");
    try {
      const response = await studentApi<{ version: number }>("/api/v1/submissions/day3/draft", {
        method: "PUT",
        headers: { "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({ version: version.current, templateVersion: data.template.templateVersion, bottles: valuesRef.current }),
      });
      version.current = response.version;
      setData((current) => current ? { ...current, status: "DRAFT", version: response.version } : current);
      setReadOnly(false); setSaveState("saved");
    } catch (caught) { setError(describeApiError(caught)); }
    finally { setReopening(false); }
  }

  async function submit() {
    if (!data) return;
    const requiredMissing = data.template.bottles.filter((config) => config.required && !bottles.some((value) => value.bottleKey === config.bottleKey && value.isConfirmed && value.level !== null)).map((config) => config.bottleKey);
    if (requiredMissing.length) { setMissing(requiredMissing); setConfirming(false); document.getElementById(`bottle-${requiredMissing[0]}`)?.focus(); return; }
    try {
      if (dirty.current && !(await saveDraft())) return;
      const result = await studentApi<{ publicId?: string }>("/api/v1/submissions/day3/submit", { method: "POST", headers: { "Idempotency-Key": newIdempotencyKey() }, body: JSON.stringify({ version: version.current, confirm: true }) });
      router.replace(result.publicId ? `/artworks/${encodeURIComponent(result.publicId)}?section=day3` : "/home"); router.refresh();
    } catch (caught) { if (isReadOnlyError(caught)) setReadOnly(true); setError(describeApiError(caught)); setConfirming(false); }
  }

  const confirmed = useMemo(() => bottles.filter((value) => value.isConfirmed && value.level !== null).length, [bottles]);
  const groups = useMemo(() => data ? Array.from(new Set(data.template.bottles.map((bottle) => bottle.group || "LITTLE BOTTLES"))) : [], [data]);
  if (!data && !error) return <PageLoading label="正在载入 Day 3" />;
  if (!data) return <PageError message={error} retry={() => void load()} />;
  if (data.template.bottles.length === 0) return <PageError message="Day 3 模板尚未配置，当前不会创建空草稿。" retry={() => void load()} />;

  return <main className="ow-phone ow-enter"><StudentHeader title="LITTLE BOTTLES" /><div className="flex items-start justify-between gap-4"><div><p className="ow-kicker">DAY 3</p><h1 className="ow-heading mt-2">把感受装进瓶子。</h1><p className="ow-muted mt-3">在瓶身拖动或点击液面。0 是有效答案，未触碰才是未回答。</p></div><span className="ow-chip ow-chip-active shrink-0">{confirmed}/{data.template.bottles.length}</span></div>{readOnly && <div className="student-notice mt-6"><b>{data.status === "SUBMITTED" ? "作品已经提交" : "当前为只读阶段"}</b><p>{data.status === "SUBMITTED" ? "作品保持只读；只有确认重新编辑后才会恢复为草稿。" : data.readOnlyReason || "瓶子保留当前液位，但不能继续调整或提交。"}</p>{data.status === "SUBMITTED" && data.canAuthor && <button type="button" disabled={reopening} onClick={() => void reopenSubmission()} className="mt-3 min-h-11 font-bold underline">{reopening ? "正在恢复草稿…" : "重新编辑作品"}</button>}</div>}{error && <p role="alert" className="mt-5 font-bold text-red-700">{error}</p>}{groups.map((group) => <section key={group} className="mt-10" aria-labelledby={`group-${group.replace(/\s/g, "-")}`}><h2 id={`group-${group.replace(/\s/g, "-")}`} className="text-2xl font-black">{group}</h2><div className="student-bottle-grid mt-5">{data.template.bottles.filter((config) => (config.group || "LITTLE BOTTLES") === group).map((config, index) => { const value = bottles.find((item) => item.bottleKey === config.bottleKey); return <Bottle key={config.bottleKey} config={config} index={index} level={value?.level ?? null} confirmed={value?.isConfirmed ?? false} disabled={readOnly} invalid={missing.includes(config.bottleKey)} change={(level) => setLevel(config.bottleKey, level)} />; })}</div></section>)}<SaveStatus state={saveState} error={error} />{!readOnly && <button type="button" onClick={() => setConfirming(true)} className="ow-btn mt-8">提交 DAY 3 →</button>}{readOnly && data.publicId && <div className="mt-8 grid grid-cols-2 gap-3"><button type="button" onClick={() => router.push(`/artworks/${encodeURIComponent(data.publicId)}?section=day3`)} className="ow-btn">查看作品 →</button><ArtworkShareButton section="DAY3" bottles={bottles} /></div>}{confirming && <ViewportDialog close={() => setConfirming(false)}><div className="ow-modal student-dialog" role="dialog" aria-modal="true" aria-labelledby="day3-submit-title"><h2 id="day3-submit-title" className="ow-heading">提交 DAY 3？</h2><p className="ow-muted mt-4">已主动回答 {confirmed}/{data.template.bottles.length} 个瓶子。提交后默认进入只读。</p><button type="button" onClick={() => void submit()} className="ow-btn mt-8">确认提交</button><button type="button" onClick={() => setConfirming(false)} className="ow-btn ow-btn-outline mt-3">返回检查</button></div></ViewportDialog>}</main>;
}

function Bottle({ config, index, level, confirmed, disabled, invalid, change }: { config: BottleConfig; index: number; level: number | null; confirmed: boolean; disabled: boolean; invalid: boolean; change: (level: number) => void }) {
  const dragging = useRef<number | null>(null);
  const visualLevel = confirmed && level !== null ? level : 0;
  function pointerLevel(event: React.PointerEvent<HTMLButtonElement>) { const rect = event.currentTarget.getBoundingClientRect(); return Math.max(0, Math.min(5, Math.round(((rect.bottom - event.clientY) / rect.height) * 5))); }
  function key(event: React.KeyboardEvent<HTMLButtonElement>) { const current = confirmed && level !== null ? level : 0; let next: number | null = null; if (["ArrowUp", "ArrowRight"].includes(event.key)) next = Math.min(5, current + 1); if (["ArrowDown", "ArrowLeft"].includes(event.key)) next = Math.max(0, current - 1); if (event.key === "Home") next = 0; if (event.key === "End") next = 5; if (next !== null) { event.preventDefault(); change(next); } }
  return <div className="student-bottle-item"><button id={`bottle-${config.bottleKey}`} type="button" disabled={disabled} role="slider" aria-label={`第 ${index + 1} 瓶，${config.label}`} aria-valuemin={0} aria-valuemax={5} aria-valuenow={confirmed ? visualLevel : undefined} aria-valuetext={confirmed ? `液位 ${visualLevel}，共 5 级` : "尚未回答，共 5 级"} aria-invalid={invalid} className={`student-bottle ${invalid ? "student-bottle-missing" : ""}`} onPointerDown={(event) => { if (disabled) return; event.currentTarget.setPointerCapture(event.pointerId); dragging.current = event.pointerId; change(pointerLevel(event)); }} onPointerMove={(event) => { if (dragging.current === event.pointerId) change(pointerLevel(event)); }} onPointerUp={(event) => { if (dragging.current === event.pointerId) dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }} onKeyDown={key}><span className="student-bottle-neck" /><span className="student-bottle-liquid" style={{ height: `${visualLevel * 20}%` }} /><span className="sr-only">{confirmed ? `${visualLevel} 级` : "未回答"}</span></button><span className="student-bottle-label">{config.label}{config.required ? " *" : ""}</span></div>;
}
