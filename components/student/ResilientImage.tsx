"use client";
/* eslint-disable @next/next/no-img-element -- R2 thumbnails already pass through the dedicated image processor */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

interface ResilientImageProps {
  src: string;
  alt: string;
  style?: CSSProperties;
  className?: string;
  eager?: boolean;
}

const MAX_AUTOMATIC_RETRIES = 2;

function retrySource(source: string, attempt: number): string {
  if (attempt === 0 || source.startsWith("blob:")) return source;
  const separator = source.includes("?") ? "&" : "?";
  return `${source}${separator}ow_image_retry=${attempt}`;
}

/**
 * Mobile webviews occasionally abort an image request while decoding a collage.
 * Hide the browser's broken-image icon, retry with a distinct browser cache key,
 * and leave a readable placeholder if the connection still cannot recover.
 */
export default function ResilientImage({ src, alt, style, className, eager = false }: ResilientImageProps) {
  const [load, setLoad] = useState<{ source: string; attempt: number; state: "loading" | "retrying" | "loaded" | "failed" }>(() => ({ source: src, attempt: 0, state: "loading" }));
  const retryTimer = useRef<number | null>(null);
  const attempt = load.source === src ? load.attempt : 0;
  const state = load.source === src ? load.state : "loading";
  const currentSource = useMemo(() => retrySource(src, attempt), [attempt, src]);

  useEffect(() => {
    if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    return () => {
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    };
  }, [src]);

  function failedToLoad() {
    if (attempt >= MAX_AUTOMATIC_RETRIES) {
      setLoad({ source: src, attempt, state: "failed" });
      return;
    }
    setLoad({ source: src, attempt, state: "retrying" });
    retryTimer.current = window.setTimeout(() => {
      setLoad({ source: src, attempt: attempt + 1, state: "loading" });
    }, 500 * (attempt + 1));
  }

  return (
    <>
      {state !== "loaded" && (
        <span className="student-image-placeholder" aria-live={state === "failed" ? "polite" : "off"}>
          {state === "failed" ? "图片暂时无法显示，请刷新重试" : state === "retrying" ? "网络波动，正在重试…" : "图片载入中…"}
        </span>
      )}
      {state !== "failed" && (
        <img
          key={currentSource}
          src={currentSource}
          alt={alt}
          className={className}
          style={{ ...style, opacity: state === "loaded" ? 1 : 0 }}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "low"}
          decoding="async"
          draggable={false}
          onLoad={() => setLoad({ source: src, attempt, state: "loaded" })}
          onError={failedToLoad}
        />
      )}
    </>
  );
}
