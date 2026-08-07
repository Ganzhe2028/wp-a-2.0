// 统一的 returnTo/next 跳转目标校验：任何登录后的跳转都必须经过此函数。
// 防御 open redirect：
// 1. 拒绝 ASCII 控制字符（tab/CR/LF 会被 WHATWG URL 解析器剥离后改变宿主解析）
// 2. 拒绝反斜杠
// 3. 必须是以单斜杠开头的相对路径（排除 // 协议相对）
// 4. 用 URL 解析做最终确认：解析结果必须仍是同源相对路径

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const BASE_URL = "https://oweek.internal.invalid";

export function safeReturnTo(value: string | null | undefined, fallback = "/home"): string {
  if (typeof value !== "string" || value.length === 0) return fallback;
  if (CONTROL_CHARS.test(value) || value.includes("\\")) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const resolved = new URL(value, BASE_URL);
    if (resolved.origin !== BASE_URL) return fallback;
    if (!resolved.pathname.startsWith("/")) return fallback;
  } catch {
    return fallback;
  }
  return value;
}
