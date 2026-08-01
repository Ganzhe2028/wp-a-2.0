export function PageLoading({ label = "正在载入" }: { label?: string }) {
  return <main className="ow-phone" aria-busy="true" aria-label={label}><div className="student-skeleton mt-20 h-14 w-2/3" /><div className="student-skeleton mt-8 h-40" /><div className="student-skeleton mt-4 h-40" /><p className="sr-only">{label}</p></main>;
}

export function PageError({ message, retry }: { message: string; retry: () => void }) {
  return <main className="ow-phone flex min-h-svh flex-col justify-center"><div className="student-state-card" role="alert"><p className="ow-kicker">暂时没有连上</p><h1 className="ow-heading mt-3">再试一次。</h1><p className="ow-muted mt-4 leading-7">{message}</p><button type="button" onClick={retry} className="ow-btn mt-8">重新载入</button></div></main>;
}

export function SaveStatus({ state, error }: { state: "idle" | "dirty" | "saving" | "saved" | "error"; error?: string }) {
  const text = state === "saving" ? "正在保存…" : state === "saved" ? "已保存" : state === "error" ? `保存失败：${error || "请重试"}` : state === "dirty" ? "有尚未保存的更改" : "";
  return <p className={`student-save-status ${state === "error" ? "text-red-700" : "ow-muted"}`} aria-live="polite">{text}</p>;
}
