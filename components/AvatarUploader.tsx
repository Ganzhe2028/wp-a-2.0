"use client";

import { useState, useRef } from "react";
import imageCompression from "browser-image-compression";

interface AvatarUploaderProps {
  currentUrl: string | null;
  onAvatarChange: (url: string | null) => void | Promise<void>;
  disabled?: boolean;
  label?: string;
  onSessionExpired?: () => void;
}

export default function AvatarUploader({
  currentUrl,
  onAvatarChange,
  disabled = false,
  label = "头像",
  onSessionExpired,
}: AvatarUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [failedFile, setFailedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    setError("");
    setFailedFile(null);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 800,
        useWebWorker: true,
      });

      const ext = compressed.type.split("/")[1] || "webp";
      const presignRes = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: `image/${ext}`, purpose: "avatar" }),
      });

      if (!presignRes.ok) {
        if (presignRes.status === 401) { onSessionExpired?.(); return; }
        const err = await presignRes.json();
        throw new Error(err.error || "获取上传地址失败");
      }

      const { putUrl, publicUrl } = await presignRes.json();

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 30_000);
      let uploadRes: Response;
      try {
        uploadRes = await fetch(putUrl, {
          method: "PUT",
          body: compressed,
          headers: { "Content-Type": `image/${ext}` },
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeout);
      }
      if (!uploadRes.ok) throw new Error("图片上传失败，请重试");

      await onAvatarChange(publicUrl);
    } catch (err) {
      const message = err instanceof DOMException && err.name === "AbortError"
        ? "上传超时，请检查网络后重试"
        : err instanceof Error ? err.message : "上传失败";
      setFailedFile(file);
      setError(message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload(file);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading || disabled}
        className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-tile)] border-[1.5px] border-[var(--line)] bg-[var(--paper)] transition-colors disabled:opacity-60 hover:border-[var(--orange)]"
      >
        {currentUrl ? (
          <img src={currentUrl} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-3xl font-black text-[var(--orange)]">+</span>
        )}
        {uploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70">
            <span className="h-6 w-6 animate-spin rounded-full border-[1.5px] border-[var(--line)] border-t-[var(--orange)]" />
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 bg-black/85 px-2 py-1 text-left text-xs font-bold text-white">{label}</span>
      </button>
      {error && (
        <div className="mt-3 rounded-[var(--radius-card)] border-[1.5px] border-[var(--orange)] bg-[var(--orange-soft)] p-4" role="alert">
          <b>上传失败</b>
          <p className="ow-muted mt-1 text-sm">图片仍保留在本机 · {error}</p>
          <button
            type="button"
            onClick={() => failedFile && upload(failedFile)}
            disabled={uploading}
            className="ow-btn ow-btn-outline mt-3 !min-h-11"
          >
            重试
          </button>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
