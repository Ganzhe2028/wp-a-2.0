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
}

export default function ImageGrid({
  images,
  onImagesChange,
  disabled = false,
}: ImageGridProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeImages = [...images];
  const remaining = Math.max(0, 4 - activeImages.length);

  async function handleFilesSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const newImages: DisplayImage[] = [...activeImages];

      for (const file of files) {
        if (newImages.length >= 4) break;

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
          const err = await presignRes.json();
          throw new Error(err.error || "Failed to get upload URL");
        }

        const { putUrl, publicUrl, key } = await presignRes.json();

        await fetch(putUrl, {
          method: "PUT",
          body: compressed,
          headers: { "Content-Type": `image/${ext}` },
        });

        const saveRes = await fetch("/api/me/images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: publicUrl, key }),
        });

        if (!saveRes.ok) throw new Error("Failed to save image record");
        const { image } = await saveRes.json();
        newImages.push(image);
      }

      onImagesChange(newImages);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(imageId: string) {
    if (!confirm("Delete this image?")) return;

    try {
      const res = await fetch(`/api/me/images?id=${imageId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      onImagesChange(activeImages.filter((img) => img.id !== imageId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-stone-700">
          Photos <span className="text-stone-400">({activeImages.length}/4)</span>
        </p>
        {remaining > 0 && !disabled && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-xs text-teal-600 hover:text-teal-700 font-medium disabled:opacity-50"
          >
            {uploading ? "Uploading…" : `+ Add (${remaining} left)`}
          </button>
        )}
      </div>

      {activeImages.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {activeImages.map((img) => (
            <div key={img.id} className="group relative aspect-square overflow-hidden rounded-lg bg-stone-100">
              <img
                src={img.url}
                alt=""
                className="h-full w-full object-cover"
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleDelete(img.id)}
                  className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {uploading && (
            <div className="aspect-square rounded-lg bg-stone-100 flex items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-teal-600" />
            </div>
          )}
        </div>
      ) : disabled ? (
        <p className="text-sm text-stone-400 py-4 text-center">No photos yet</p>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full rounded-lg border-2 border-dashed border-stone-200 bg-stone-50 py-8 text-center text-sm text-stone-400 hover:border-teal-300 hover:text-teal-500 transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-teal-600" />
              Uploading…
            </span>
          ) : (
            "+ Add photos"
          )}
        </button>
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
