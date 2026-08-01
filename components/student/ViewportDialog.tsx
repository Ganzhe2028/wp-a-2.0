"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const subscribe = () => () => undefined;

export default function ViewportDialog({ children, close }: { children: ReactNode; close?: () => void }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const closeRef = useRef(close);

  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  if (!mounted) return null;
  return createPortal(
    <div className="ow-scrim student-dialog-wrap" role="presentation">{children}</div>,
    document.body,
  );
}
