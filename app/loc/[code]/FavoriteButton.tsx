"use client";

import { useCallback, useState } from "react";

interface FavoriteButtonProps {
  code: string;
  name: string;
  initialFavorited: boolean;
}

export default function FavoriteButton({
  code,
  name,
  initialFavorited,
}: FavoriteButtonProps) {
  const [isFavorited, setIsFavorited] = useState(initialFavorited);

  const toggle = useCallback(async () => {
    const previousState = isFavorited;
    setIsFavorited(!previousState);

    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      if (!res.ok) {
        setIsFavorited(previousState);
      }
    } catch {
      setIsFavorited(previousState);
    }
  }, [code, isFavorited]);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isFavorited ? "取消收藏" : "收藏"}
      className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
        isFavorited
          ? "bg-amber-50 text-amber-600 ring-1 ring-amber-200 hover:bg-amber-100"
          : "bg-zinc-50 text-zinc-500 ring-1 ring-zinc-200 hover:bg-zinc-100 hover:text-zinc-700"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill={isFavorited ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <title>{isFavorited ? "已收藏" : "收藏"}</title>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        />
      </svg>
      {isFavorited ? "已收藏" : "收藏 TA"}
    </button>
  );
}