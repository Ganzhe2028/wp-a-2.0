"use client";
/* eslint-disable @next/next/no-img-element -- authenticated R2 URLs are short-lived and intentionally unoptimized */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import StudentHeader from "@/components/student/StudentHeader";
import { PageError, PageLoading, SaveStatus } from "@/components/student/AsyncState";
import ViewportDialog from "@/components/student/ViewportDialog";
import ResilientImage from "@/components/student/ResilientImage";
import ArtworkShareButton from "@/components/student/ArtworkShareButton";
import { describeApiError, isReadOnlyError, loginUrl, newIdempotencyKey, studentApi, StudentApiError, type SubmissionStatus } from "@/components/student/api";
import { compressForUpload, ImageCompressionTooLargeError, LARGE_SOURCE_IMAGE_BYTES, MAX_SOURCE_IMAGE_BYTES, putPresignedImage, retryUploadRequest, withUploadPermit, type CompressionMode } from "@/components/student/image-upload";

interface Crop { x: number; y: number; scale: number }
interface SlotConfig { slotKey: string; label: string; required: boolean; aspectRatio: number }
interface SlotValue { slotKey: string; assetId: string; imageUrl?: string; originalUrl?: string; crop: Crop }
interface PendingPreview { preview: string; crop: Crop }
interface CropSelection { config: SlotConfig; value?: SlotValue; file?: File; preview: string; pendingCrop?: Crop; compressionMode?: CompressionMode; failureKind?: "too-large" }
interface Day1Data { status: SubmissionStatus; version: number; canAuthor: boolean; readOnlyReason?: string; template: { templateVersion: string; slots: SlotConfig[] }; slots: SlotValue[]; publicId: string }

const EMPTY_CROP: Crop = { x: .5, y: .5, scale: 1 };

function normalizeDay1(raw: Day1Data): Day1Data {
  const value = raw as Day1Data & { submission?: Partial<Day1Data>; config?: Day1Data["template"]; templateVersion?: string };
  const submission = value.submission || value;
  const template = value.template || value.config || { templateVersion: value.templateVersion || "", slots: [] };
  return {
    status: submission.status || "NOT_STARTED",
    version: submission.version || 1,
    canAuthor: submission.canAuthor ?? value.canAuthor ?? false,
    readOnlyReason: submission.readOnlyReason || value.readOnlyReason,
    template: { templateVersion: template.templateVersion || "", slots: Array.isArray(template.slots) ? template.slots.map((slot) => ({ ...slot, required: slot.required !== false, aspectRatio: Number(slot.aspectRatio) || 1 })) : [] },
    slots: Array.isArray(submission.slots) ? submission.slots : [],
    publicId: submission.publicId || value.publicId || "",
  };
}

export default function Day1Client() {
  const router = useRouter();
  const [data, setData] = useState<Day1Data | null>(null);
  const [slots, setSlots] = useState<SlotValue[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [activeCrop, setActiveCrop] = useState<CropSelection | null>(null);
  const [largeImagePrompt, setLargeImagePrompt] = useState<CropSelection | null>(null);
  const [uploadingSlots, setUploadingSlots] = useState<Set<string>>(() => new Set());
  const [uploadStages, setUploadStages] = useState<Record<string, string>>({});
  const [pendingPreviews, setPendingPreviews] = useState<Record<string, PendingPreview>>({});
  const [failedCrops, setFailedCrops] = useState<Record<string, CropSelection>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedConfig = useRef<SlotConfig | null>(null);
  const version = useRef(1);
  const slotsRef = useRef<SlotValue[]>([]);
  const dirty = useRef(false);
  const revision = useRef(0);
  const lastSave = useRef(0);

  const load = useCallback(async () => {
    setError("");
    try {
      const next = normalizeDay1(await studentApi<Day1Data>("/api/v1/submissions/day1"));
      setData(next); setSlots(next.slots); slotsRef.current = next.slots; version.current = next.version; setReadOnly(!next.canAuthor || next.status === "SUBMITTED");
    } catch (caught) {
      if (caught instanceof StudentApiError && caught.status === 401) { router.replace(loginUrl("/me/day-1")); return; }
      setError(describeApiError(caught));
    }
  }, [router]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const saveDraft = useCallback(async (keepalive = false) => {
    if (!data || readOnly || !dirty.current) return true;
    const saveRevision = revision.current;
    const snapshot = slotsRef.current;
    setError("");
    setSaveState("saving");
    try {
      const response = await studentApi<{ version: number }>("/api/v1/submissions/day1/draft", {
        method: "PUT", keepalive, headers: { "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({ version: version.current, templateVersion: data.template.templateVersion, slots: snapshot.map(({ slotKey, assetId, crop }) => ({ slotKey, assetId, crop })) }),
      });
      version.current = response.version; lastSave.current = Date.now();
      if (revision.current === saveRevision) { dirty.current = false; setSaveState("saved"); } else { dirty.current = true; setSaveState("dirty"); }
      return true;
    } catch (caught) {
      if (isReadOnlyError(caught)) setReadOnly(true);
      setSaveState("error"); setError(describeApiError(caught)); return false;
    }
  }, [data, readOnly]);

  useEffect(() => {
    if (saveState !== "dirty") return;
    const wait = Math.max(900, 2000 - (Date.now() - lastSave.current));
    const timer = window.setTimeout(() => void saveDraft(), wait);
    return () => window.clearTimeout(timer);
  }, [saveDraft, saveState, slots]);
  useEffect(() => {
    const leave = () => { if (dirty.current) void saveDraft(true); };
    const online = () => { if (dirty.current) void saveDraft(); };
    const warn = (event: BeforeUnloadEvent) => { if (dirty.current) event.preventDefault(); };
    window.addEventListener("pagehide", leave);
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("pagehide", leave); window.removeEventListener("online", online); window.removeEventListener("beforeunload", warn); };
  }, [saveDraft]);

  function updateSlot(next: SlotValue) {
    setSlots((current) => {
      const values = current.some((slot) => slot.slotKey === next.slotKey) ? current.map((slot) => slot.slotKey === next.slotKey ? next : slot) : [...current, next];
      slotsRef.current = values; return values;
    });
    revision.current += 1; dirty.current = true; setSaveState("dirty"); setMissing((current) => current.filter((key) => key !== next.slotKey));
  }

  async function reopenSubmission() {
    if (!data || data.status !== "SUBMITTED" || !data.canAuthor || !window.confirm("重新编辑会把已提交作品恢复为草稿。在再次提交前，Gallery 中不会展示未提交的改动。")) return;
    setReopening(true); setError("");
    try {
      const response = await studentApi<{ version: number }>("/api/v1/submissions/day1/draft", {
        method: "PUT",
        headers: { "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({ version: version.current, templateVersion: data.template.templateVersion, slots: slotsRef.current.map(({ slotKey, assetId, crop }) => ({ slotKey, assetId, crop })) }),
      });
      version.current = response.version;
      setData((current) => current ? { ...current, status: "DRAFT", version: response.version } : current);
      setReadOnly(false); setSaveState("saved");
    } catch (caught) { setError(describeApiError(caught)); }
    finally { setReopening(false); }
  }

  function choose(config: SlotConfig) {
    if (readOnly) return;
    selectedConfig.current = config;
    fileInput.current?.click();
  }

  function selectedFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const config = selectedConfig.current;
    event.target.value = "";
    if (!file || !config) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("请选择 JPEG、PNG 或 WebP 图片"); return; }
    if (file.size > MAX_SOURCE_IMAGE_BYTES) { setError("原图超过 30 MB，手机浏览器可能无法稳定处理；请先截图或选择较小的图片"); return; }
    setFailedCrops((current) => { const next = { ...current }; delete next[config.slotKey]; return next; });
    setError("");
    const selection = { config, file, preview: URL.createObjectURL(file) };
    if (file.size > LARGE_SOURCE_IMAGE_BYTES) { setLargeImagePrompt(selection); return; }
    setActiveCrop(selection);
  }

  function setUploadStage(slotKey: string, label: string) {
    setUploadStages((current) => ({ ...current, [slotKey]: label }));
  }

  async function acceptCrop(crop: Crop) {
    if (!activeCrop) return;
    const { config, file, value, preview } = activeCrop;
    setActiveCrop(null); setError("");
    if (!file && value) { updateSlot({ ...value, crop }); return; }
    if (!file) return;
    setUploadingSlots((current) => new Set(current).add(config.slotKey));
    setUploadStage(config.slotKey, "等待处理…");
    setPendingPreviews((current) => ({ ...current, [config.slotKey]: { preview, crop } }));
    try {
      const presigned = await withUploadPermit(async () => {
        setUploadStage(config.slotKey, "压缩中 0%");
        const compressed = await compressForUpload(file, (progress) => setUploadStage(config.slotKey, `压缩中 ${progress}%`), activeCrop.compressionMode);
        setUploadStage(config.slotKey, "准备上传…");
        const checksum = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await compressed.arrayBuffer()))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
        const presignKey = newIdempotencyKey();
        const task = await retryUploadRequest(
          (signal) => studentApi<{ assetId: string; uploadUrl: string }>("/api/v1/assets/presign", {
            method: "POST",
            signal,
            headers: { "Idempotency-Key": presignKey },
            body: JSON.stringify({ section: "DAY1", fileName: compressed.name, mimeType: compressed.type, byteSize: compressed.size, checksum }),
          }),
          (attempt) => setUploadStage(config.slotKey, `重新连接 ${attempt}/3…`),
        );
        setUploadStage(config.slotKey, "上传中…");
        await putPresignedImage(task.uploadUrl, compressed, (attempt) => setUploadStage(config.slotKey, `重新上传 ${attempt}/3…`));
        return task;
      }, () => setUploadStage(config.slotKey, "排队中…"));
      setUploadStage(config.slotKey, "安全处理中…");
      const completeKey = newIdempotencyKey();
      const completed = await retryUploadRequest(
        (signal) => studentApi<{ assetId?: string; imageUrl?: string; url?: string; status?: string }>(`/api/v1/assets/${encodeURIComponent(presigned.assetId)}/complete`, {
          method: "POST",
          signal,
          headers: { "Idempotency-Key": completeKey },
          body: JSON.stringify({ section: "DAY1" }),
        }),
        (attempt) => setUploadStage(config.slotKey, `确认上传 ${attempt}/3…`),
      );
      let imageUrl = completed.imageUrl || completed.url;
      if (!imageUrl && completed.status === "PROCESSING") {
        for (let attempt = 0; attempt < 45; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, attempt < 8 ? 600 : 1_000));
          const status = await retryUploadRequest(
            (signal) => studentApi<{ status: "PROCESSING" | "READY" | "FAILED"; imageUrl?: string }>(`/api/v1/assets/${encodeURIComponent(presigned.assetId)}`, { signal }),
            () => setUploadStage(config.slotKey, "网络波动，自动重试…"),
            2,
          );
          if (status.status === "FAILED") throw new Error("图片安全处理失败，请重新选择图片");
          if (status.status === "READY" && status.imageUrl) { imageUrl = status.imageUrl; break; }
        }
      }
      if (!imageUrl) throw new Error("图片仍在安全处理中，请稍后重新尝试");
      updateSlot({ slotKey: config.slotKey, assetId: completed.assetId || presigned.assetId, imageUrl, crop });
      setPendingPreviews((current) => { const next = { ...current }; delete next[config.slotKey]; return next; });
      setFailedCrops((current) => { const next = { ...current }; delete next[config.slotKey]; return next; });
      URL.revokeObjectURL(preview);
    } catch (caught) {
      if (isReadOnlyError(caught)) setReadOnly(true);
      setPendingPreviews((current) => { const next = { ...current }; delete next[config.slotKey]; return next; });
      if (caught instanceof ImageCompressionTooLargeError) {
        setError(`${caught.message}；点按保留的图片并选择“重新选择图片”。`);
        setFailedCrops((current) => ({ ...current, [config.slotKey]: { config, file, value, preview, pendingCrop: crop, compressionMode: "strong", failureKind: "too-large" } }));
      } else {
        setError(`${caught instanceof Error && !(caught instanceof StudentApiError) ? caught.message : describeApiError(caught)}；点按对应格子可直接重试。`);
        setFailedCrops((current) => ({ ...current, [config.slotKey]: { config, file, value, preview, pendingCrop: crop, compressionMode: activeCrop.compressionMode } }));
      }
    } finally {
      setUploadingSlots((current) => { const next = new Set(current); next.delete(config.slotKey); return next; });
      setUploadStages((current) => { const next = { ...current }; delete next[config.slotKey]; return next; });
    }
  }

  async function submit() {
    if (!data) return;
    if (uploadingSlots.size > 0) { setError(`还有 ${uploadingSlots.size} 张图片正在后台处理，完成后即可提交。`); setConfirming(false); return; }
    const requiredMissing = data.template.slots.filter((config) => config.required && !slots.some((slot) => slot.slotKey === config.slotKey)).map((slot) => slot.slotKey);
    if (requiredMissing.length) { setMissing(requiredMissing); setConfirming(false); document.getElementById(`slot-${requiredMissing[0]}`)?.focus(); return; }
    try {
      if (dirty.current && !(await saveDraft())) return;
      const result = await studentApi<{ publicId?: string }>("/api/v1/submissions/day1/submit", { method: "POST", headers: { "Idempotency-Key": newIdempotencyKey() }, body: JSON.stringify({ version: version.current, confirm: true }) });
      router.replace(result.publicId ? `/artworks/${encodeURIComponent(result.publicId)}?section=day1` : "/home"); router.refresh();
    } catch (caught) { if (isReadOnlyError(caught)) setReadOnly(true); setError(describeApiError(caught)); setConfirming(false); }
  }

  function discardCrop(selection: CropSelection) {
    if (selection.file) URL.revokeObjectURL(selection.preview);
    setFailedCrops((current) => { const next = { ...current }; delete next[selection.config.slotKey]; return next; });
    setActiveCrop(null);
  }

  function replaceCrop(selection: CropSelection) {
    const config = selection.config;
    discardCrop(selection);
    choose(config);
  }

  const completed = useMemo(() => data?.template.slots.filter((config) => slots.some((slot) => slot.slotKey === config.slotKey)).length || 0, [data, slots]);
  if (!data && !error) return <PageLoading label="正在载入 Day 1" />;
  if (!data) return <PageError message={error} retry={() => void load()} />;
  if (data.template.slots.length === 0) return <PageError message="Day 1 模板尚未配置，当前不会创建空草稿。" retry={() => void load()} />;

  return (
    <main className="ow-phone ow-enter">
      <StudentHeader title="IT’S ME" />
      <div className="flex items-start justify-between gap-4">
        <div><p className="ow-kicker">DAY 1</p><h1 className="ow-heading mt-2">把你拼进这一页。</h1><p className="ow-muted mt-3">选好构图后会立即显示预览，图片在后台上传；你可以继续填写其他格。</p></div>
        <span className="ow-chip ow-chip-active shrink-0">{completed}/{data.template.slots.length}</span>
      </div>
      {readOnly && <div className="student-notice mt-6"><b>{data.status === "SUBMITTED" ? "作品已经提交" : "当前为只读阶段"}</b><p>{data.status === "SUBMITTED" ? "作品保持只读；只有确认重新编辑后才会恢复为草稿。" : data.readOnlyReason || "现有作品仍可查看，但不能保存、替换或提交。"}</p>{data.status === "SUBMITTED" && data.canAuthor && <button type="button" disabled={reopening} onClick={() => void reopenSubmission()} className="mt-3 min-h-11 font-bold underline">{reopening ? "正在恢复草稿…" : "重新编辑作品"}</button>}</div>}
      {uploadingSlots.size > 0 && <div className="student-notice mt-5" role="status"><b>后台正在处理 {uploadingSlots.size} 张图片</b><p>系统会自动压缩并在弱网时重试；为避免手机卡顿，每次最多同时上传 2 张。</p></div>}
      {error && <p role="alert" className="mt-5 font-bold text-red-700">{error}</p>}
      <div className="student-collage mt-8">
        {data.template.slots.map((config, index) => {
          const value = slots.find((slot) => slot.slotKey === config.slotKey);
          const pending = pendingPreviews[config.slotKey];
          const failed = failedCrops[config.slotKey];
          const imageUrl = pending?.preview || failed?.preview || value?.imageUrl;
          const crop = pending?.crop || failed?.pendingCrop || value?.crop || EMPTY_CROP;
          const uploading = uploadingSlots.has(config.slotKey);
          return <button id={`slot-${config.slotKey}`} key={config.slotKey} type="button" disabled={readOnly || uploading} onClick={() => failed ? setActiveCrop(failed) : value?.imageUrl ? setActiveCrop({ config, value, preview: value.imageUrl }) : choose(config)} className={`student-slot student-slot-${index % 6} ${missing.includes(config.slotKey) ? "student-slot-missing" : ""}`}><span className="student-slot-media">{imageUrl ? <ResilientImage src={imageUrl} alt="" eager={index < 3} style={{ transform: `translate(${(crop.x - .5) * 36}%, ${(crop.y - .5) * 36}%) scale(${crop.scale})` }} /> : <span className="student-slot-add" aria-hidden="true">＋</span>}</span>{uploading && <span className="absolute top-2 right-2 z-10 max-w-[85%] rounded-full bg-white/95 px-2 py-1 text-[11px] font-black text-[var(--orange)]">{uploadStages[config.slotKey] || "处理中…"}</span>}{failed && <span className="absolute top-2 right-2 z-10 rounded-full bg-red-700 px-2 py-1 text-[11px] font-black text-white">{failed.failureKind === "too-large" ? "请换一张" : "点按重试"}</span>}<span className="student-slot-label">{config.label}{config.required ? " *" : ""}</span></button>;
        })}
      </div>
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={selectedFile} className="sr-only" />
      <SaveStatus state={saveState} error={error} />
      {!readOnly && <button type="button" disabled={uploadingSlots.size > 0} onClick={() => setConfirming(true)} className="ow-btn mt-8">{uploadingSlots.size > 0 ? `正在处理 ${uploadingSlots.size} 张图片…` : "提交 DAY 1 →"}</button>}
      {readOnly && data.publicId && <div className="mt-8 grid grid-cols-2 gap-3"><button type="button" onClick={() => router.push(`/artworks/${encodeURIComponent(data.publicId)}?section=day1`)} className="ow-btn">查看作品 →</button><ArtworkShareButton section="DAY1" slots={slots} /></div>}
      {confirming && <Confirm completed={completed} total={data.template.slots.length} cancel={() => setConfirming(false)} submit={() => void submit()} />}
      {largeImagePrompt && <LargeImagePrompt file={largeImagePrompt.file!} cancel={() => { URL.revokeObjectURL(largeImagePrompt.preview); setLargeImagePrompt(null); }} compress={() => { setActiveCrop({ ...largeImagePrompt, compressionMode: "strong" }); setLargeImagePrompt(null); }} />}
      {activeCrop && <CropDialog source={activeCrop.preview} aspectRatio={activeCrop.config.aspectRatio} initial={activeCrop.pendingCrop || activeCrop.value?.crop || EMPTY_CROP} cancel={() => discardCrop(activeCrop)} replace={() => replaceCrop(activeCrop)} accept={(crop) => void acceptCrop(crop)} />}
    </main>
  );
}

function LargeImagePrompt({ file, cancel, compress }: { file: File; cancel: () => void; compress: () => void }) {
  const megabytes = (file.size / (1024 * 1024)).toFixed(1);
  return <ViewportDialog close={cancel}><div className="ow-modal student-dialog" role="dialog" aria-modal="true" aria-labelledby="large-image-title"><p className="ow-kicker">LARGE IMAGE</p><h2 id="large-image-title" className="ow-heading mt-2">这张照片有 {megabytes} MB</h2><p className="ow-muted mt-4">原图较大。网站可以先在你的手机本地加强压缩，再上传约 500 KB 的 WebP 图片；原图不会发送给第三方压缩网站。</p><button type="button" onClick={compress} className="ow-btn mt-8">压缩后继续 →</button><button type="button" onClick={cancel} className="ow-btn ow-btn-outline mt-3">重新选择图片</button></div></ViewportDialog>;
}

function Confirm({ completed, total, cancel, submit }: { completed: number; total: number; cancel: () => void; submit: () => void }) {
  return <ViewportDialog close={cancel}><div className="ow-modal student-dialog" role="dialog" aria-modal="true" aria-labelledby="day1-submit-title"><h2 id="day1-submit-title" className="ow-heading">提交 DAY 1？</h2><p className="ow-muted mt-4">已完成 {completed}/{total} 格。提交后默认进入只读，管理员开放编辑时才可修改。</p><button type="button" onClick={submit} className="ow-btn mt-8">确认提交</button><button type="button" onClick={cancel} className="ow-btn ow-btn-outline mt-3">返回检查</button></div></ViewportDialog>;
}

function CropDialog({ source, aspectRatio, initial, cancel, replace, accept }: { source: string; aspectRatio: number; initial: Crop; cancel: () => void; replace: () => void; accept: (crop: Crop) => void }) {
  const [crop, setCrop] = useState(initial);
  const dragging = useRef<{ id: number; x: number; y: number; crop: Crop } | null>(null);
  function move(event: React.PointerEvent<HTMLDivElement>) { const start = dragging.current; if (!start || start.id !== event.pointerId) return; const rect = event.currentTarget.getBoundingClientRect(); setCrop({ ...start.crop, x: Math.min(1, Math.max(0, start.crop.x + (event.clientX - start.x) / rect.width)), y: Math.min(1, Math.max(0, start.crop.y + (event.clientY - start.y) / rect.height)) }); }
  return <ViewportDialog close={cancel}><div className="ow-modal student-dialog" role="dialog" aria-modal="true" aria-labelledby="crop-title"><h2 id="crop-title" className="text-2xl font-black">调整图片位置</h2><p className="ow-muted mt-2">拖动图片，确保画面覆盖裁切窗口。</p><div className="student-crop-window mt-6" style={{ aspectRatio }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dragging.current = { id: event.pointerId, x: event.clientX, y: event.clientY, crop }; }} onPointerMove={move} onPointerUp={() => { dragging.current = null; }}><img src={source} alt="待裁切图片预览" draggable={false} style={{ transform: `translate(${(crop.x - .5) * 36}%, ${(crop.y - .5) * 36}%) scale(${crop.scale})` }} /></div><div className="mt-5 flex items-center justify-center gap-3" aria-label="缩放图片"><button type="button" className="student-square-button" aria-label="缩小" onClick={() => setCrop((current) => ({ ...current, scale: Math.max(1, +(current.scale - .1).toFixed(2)) }))}>−</button><span className="font-bold">{Math.round(crop.scale * 100)}%</span><button type="button" className="student-square-button" aria-label="放大" onClick={() => setCrop((current) => ({ ...current, scale: Math.min(3, +(current.scale + .1).toFixed(2)) }))}>＋</button></div><button type="button" onClick={() => accept(crop)} className="ow-btn mt-6">使用这个位置</button><button type="button" onClick={replace} className="ow-btn ow-btn-outline mt-3">重新选择图片</button><button type="button" onClick={cancel} className="mt-3 min-h-11 w-full font-bold">取消</button></div></ViewportDialog>;
}
