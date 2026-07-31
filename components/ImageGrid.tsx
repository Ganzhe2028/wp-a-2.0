"use client";

import { useState, useRef } from "react";
import imageCompression from "browser-image-compression";

interface DisplayImage {
  id: string;
  url: string;
  sort: number;
}

interface ImageGridProps {
  images: DisplayImage[];
  onImagesChange: (images: DisplayImage[]) => void;
  disabled?: boolean;
  maxImages?: number;
  labels?: readonly string[];
  onSessionExpired?: () => void;
}

export default function ImageGrid({
  images,
  onImagesChange,
  disabled = false,
  maxImages = 4,
  labels = [],
  onSessionExpired,
}: ImageGridProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [failedFiles, setFailedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeImages = [...images];
  const remaining = Math.max(0, maxImages - activeImages.length);

  async function uploadFiles(files: File[]) {
    setUploading(true);
    setError("");
    setFailedFiles([]);
    try {
      const newImages: DisplayImage[] = [...activeImages];

      for (const file of files) {
        if (newImages.length >= maxImages) break;

        const compressed = await imageCompression(file, {
          maxSizeMB: 0.5,
          maxWidthOrHeight: 1600,
          useWebWorker: true,
        });

        const ext = compressed.type.split("/")[1] || "webp";
        const presignRes = await fetch("/api/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentType: `image/${ext}` }),
        });

        if (!presignRes.ok) {
          if (presignRes.status === 401) { onSessionExpired?.(); return; }
          const err = await presignRes.json();
          throw new Error(err.error || "获取上传地址失败");
        }

        const { putUrl, publicUrl, key } = await presignRes.json();

        const uploadRes = await fetch(putUrl, {
          method: "PUT",
          body: compressed,
          headers: { "Content-Type": `image/${ext}` },
        });
        if (!uploadRes.ok) throw new Error("图片上传失败，请重试");

        const saveRes = await fetch("/api/me/images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: publicUrl, key }),
        });

        if (!saveRes.ok) {
          if (saveRes.status === 401) { onSessionExpired?.(); return; }
          throw new Error("图片记录保存失败");
        }
        const { image } = await saveRes.json();
        newImages.push(image);
      }

      onImagesChange(newImages);
    } catch (err) {
      setFailedFiles(files);
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleFilesSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) uploadFiles(files);
  }

  async function handleDelete(imageId: string) {
    if (!confirm("删除这张图片？")) return;

    try {
      const res = await fetch(`/api/me/images?id=${imageId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("删除失败，请重试");
      onImagesChange(activeImages.filter((img) => img.id !== imageId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {activeImages.map((img, index) => (
          <div key={img.id} className="group relative aspect-square overflow-hidden rounded-[var(--radius-tile)] bg-[var(--paper)]">
            <img
              src={img.url}
              alt={labels[index] || ""}
              className="h-full w-full object-cover"
            />
            {labels[index] && <span className="absolute inset-x-0 bottom-0 bg-black/85 px-2 py-1 text-xs font-bold text-white">{labels[index]}</span>}
            {!disabled && (
              <button
                type="button"
                onClick={() => handleDelete(img.id)}
                aria-label={`删除${labels[index] || "图片"}`}
                className="absolute top-1 right-1 flex h-11 w-11 items-center justify-center rounded-[var(--radius-btn)] bg-black/70 text-white transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {uploading && (
          <div className="flex aspect-square items-center justify-center rounded-[var(--radius-tile)] bg-[var(--paper)]">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--orange)]" />
          </div>
        )}
        {!disabled && !uploading && Array.from({ length: remaining }).map((_, i) => {
          const label = labels[activeImages.length + i];
          return (
            <button
              key={`empty-${activeImages.length + i}`}
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative aspect-square rounded-[var(--radius-tile)] border-2 border-dashed border-[var(--line)] bg-[var(--paper)] transition-colors hover:border-[var(--orange)]"
            >
              <span className="flex h-full w-full items-center justify-center text-2xl font-black text-[var(--orange)]">+</span>
              {label && <span className="absolute inset-x-0 bottom-0 px-2 py-1 text-xs font-bold text-[var(--muted)]">{label}</span>}
            </button>
          );
        })}
        {disabled && activeImages.length === 0 && (
          <p className="col-span-2 py-4 text-center text-sm text-[var(--muted)]">还没有照片</p>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-[var(--radius-card)] border-2 border-[var(--orange)] bg-[var(--orange-soft)] p-4" role="alert">
          <b>{error.includes("删除") ? "删除失败" : "上传失败"}</b>
          <p className="ow-muted mt-1 text-sm">{error.includes("删除") ? error : `图片仍保留在本机 · ${error}`}</p>
          {failedFiles.length > 0 && (
            <button
              type="button"
              onClick={() => uploadFiles(failedFiles)}
              disabled={uploading}
              className="ow-btn ow-btn-outline mt-3 !min-h-11"
            >
              重试
            </button>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={handleFilesSelect}
        className="hidden"
      />
    </div>
  );
}
