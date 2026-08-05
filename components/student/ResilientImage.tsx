"use client";
/* eslint-disable @next/next/no-img-element -- R2 thumbnails already pass through the dedicated image processor */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

interface ResilientImageProps {
  src: string;
  fallbackSrc?: string;
  alt: string;
  style?: CSSProperties;
  className?: string;
  eager?: boolean;
}

const MAX_AUTOMATIC_RETRIES = 2;
const IMAGE_LOAD_TIMEOUT_MS = 8_000;

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
export default function ResilientImage({ src, fallbackSrc, alt, style, className, eager = false }: ResilientImageProps) {
  const requestKey = `${src}\u0000${fallbackSrc || ""}`;
  const [load, setLoad] = useState<{ requestKey: string; source: string; attempt: number; state: "loading" | "retrying" | "loaded" | "failed" }>(() => ({ requestKey, source: src, attempt: 0, state: "loading" }));
  const retryTimer = useRef<number | null>(null);
  const loadTimeout = useRef<number | null>(null);
  const currentRequest = load.requestKey === requestKey;
  const activeSource = currentRequest ? load.source : src;
  const activeAttempt = currentRequest ? load.attempt : 0;
  const activeState = currentRequest ? load.state : "loading";
  const currentSource = retrySource(activeSource, activeAttempt);

  useEffect(() => {
    if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    if (loadTimeout.current !== null) window.clearTimeout(loadTimeout.current);
    return () => {
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
      if (loadTimeout.current !== null) window.clearTimeout(loadTimeout.current);
    };
  }, [requestKey]);

  const failedToLoad = useCallback(() => {
    if (fallbackSrc && activeSource === src && fallbackSrc !== src) {
      setLoad({ requestKey, source: fallbackSrc, attempt: 0, state: "loading" });
      return;
    }
    if (activeAttempt >= MAX_AUTOMATIC_RETRIES) {
      setLoad({ requestKey, source: activeSource, attempt: activeAttempt, state: "failed" });
      return;
    }
    setLoad({ requestKey, source: activeSource, attempt: activeAttempt, state: "retrying" });
    retryTimer.current = window.setTimeout(() => {
      setLoad({ requestKey, source: activeSource, attempt: activeAttempt + 1, state: "loading" });
    }, 500 * (activeAttempt + 1));
  }, [activeAttempt, activeSource, fallbackSrc, requestKey, src]);

  useEffect(() => {
    if (activeState !== "loading") return;
    loadTimeout.current = window.setTimeout(failedToLoad, IMAGE_LOAD_TIMEOUT_MS);
    return () => {
      if (loadTimeout.current !== null) window.clearTimeout(loadTimeout.current);
    };
  }, [activeState, currentSource, failedToLoad]);

  return (
    <>
      {activeState !== "loaded" && (
        <span className="student-image-placeholder" aria-live={activeState === "failed" ? "polite" : "off"}>
          {activeState === "failed" ? "图片暂时无法显示，请刷新重试" : activeState === "retrying" ? "网络波动，正在重试…" : "图片载入中…"}
        </span>
      )}
      {activeState !== "failed" && (
        <img
          key={currentSource}
          src={currentSource}
          alt={alt}
          className={className}
          style={{ ...style, opacity: activeState === "loaded" ? 1 : 0 }}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "low"}
          decoding="async"
          draggable={false}
          onLoad={() => setLoad({ requestKey, source: activeSource, attempt: activeAttempt, state: "loaded" })}
          onError={failedToLoad}
        />
      )}
    </>
  );
}
