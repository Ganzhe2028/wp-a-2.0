"use client";

import { useCallback, useState } from "react";

interface ShareButtonProps {
  code: string;
}

export default function ShareButton({ code }: ShareButtonProps) {
  const [showToast, setShowToast] = useState(false);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/u/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    }
  }, [code]);

  return (
    <>
      <style>{`@keyframes slideDown{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <button
        type="button"
        onClick={handleShare}
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-stone-500 transition-colors hover:bg-teal-50 hover:text-teal-600"
        aria-label="Share profile link"
        title="分享主页"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
        >
          <title>Share</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z"
          />
        </svg>
      </button>

      {showToast && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 animate-[slideDown_0.3s_ease-out]">
          <div className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white shadow-lg">
            链接已复制，可以粘贴给朋友啦
          </div>
        </div>
      )}
    </>
  );
}
