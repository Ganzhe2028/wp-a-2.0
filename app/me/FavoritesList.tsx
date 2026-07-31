"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface FavoriteItem {
  code: string;
  chineseName: string | null;
  englishName: string | null;
  avatarUrl: string | null;
  favoritedAt: string;
}

type PageState = "loading" | "empty" | "error" | "data";

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>收藏</title>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  const weeks = Math.floor(days / 7);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  if (weeks < 4) return `${weeks}周前`;

  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 px-5">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-xl border border-zinc-100 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/5 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-3 w-1/4 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
          <div className="h-3 w-14 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 pb-16">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-950/30">
        <HeartIcon className="h-9 w-9 text-rose-400 dark:text-rose-500/60" />
      </div>
      <p className="mb-2 text-center text-lg font-medium text-zinc-700 dark:text-zinc-300">
        还没有收藏任何人
      </p>
      <p className="max-w-xs text-center text-sm leading-relaxed text-zinc-400 dark:text-zinc-500">
        去逛逛大家的展位吧，遇到感兴趣的同学可以收藏起来
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 pb-16">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
        <HeartIcon className="h-9 w-9 text-red-400 dark:text-red-500/60" />
      </div>
      <p className="mb-2 text-center text-lg font-medium text-zinc-700 dark:text-zinc-300">
        加载失败
      </p>
      <p className="max-w-xs text-center text-sm leading-relaxed text-zinc-400 dark:text-zinc-500">
        请检查网络后刷新页面重试
      </p>
    </div>
  );
}

function FavoritesListItems({ items }: { items: FavoriteItem[] }) {
  return (
    <div className="flex-1 space-y-3 px-5 pb-8">
      {items.map((item) => {
        const name = item.chineseName || item.englishName || item.code;
        return (
          <Link
            key={item.code}
            href={`/loc/${item.code}`}
            className="group flex items-center gap-4 rounded-xl border border-zinc-100 bg-white p-4 transition-colors hover:border-zinc-200 hover:bg-zinc-50 active:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60 dark:active:bg-zinc-800"
          >
            {item.avatarUrl ? (
              <img
                src={item.avatarUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 to-rose-300 text-sm font-semibold text-white dark:from-amber-600 dark:to-rose-700">
                {name.charAt(0)}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium text-zinc-800 dark:text-zinc-100">
                {item.englishName && <span>{item.englishName}</span>}
                {item.englishName && item.chineseName && <span> · </span>}
                {item.chineseName && <span>{item.chineseName}</span>}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                {item.code}
              </p>
            </div>

            <time className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
              {formatRelativeTime(item.favoritedAt)}
            </time>

            <svg
              className="h-4 w-4 shrink-0 text-zinc-300 transition-transform group-hover:translate-x-0.5 dark:text-zinc-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <title>查看</title>
              <path d="m9 18 6-6-6-6" />
            </svg>
          </Link>
        );
      })}
    </div>
  );
}

export default function FavoritesList() {
  const [state, setState] = useState<PageState>("loading");
  const [items, setItems] = useState<FavoriteItem[]>([]);

  useEffect(() => {
    fetch("/api/me/favorites")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => {
        if (data.favorites && data.favorites.length > 0) {
          setItems(data.favorites);
          setState("data");
        } else {
          setState("empty");
        }
      })
      .catch(() => {
        setState("error");
      });
  }, []);

  if (state === "loading") {
    return <LoadingSkeleton />;
  }

  if (state === "empty") {
    return <EmptyState />;
  }

  if (state === "error") {
    return <ErrorState />;
  }

  return <FavoritesListItems items={items} />;
}