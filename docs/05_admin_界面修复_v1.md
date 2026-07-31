# 05 开发文档 · Admin 界面修复 (account 分支)

> 执行者:opencode (DeepSeek-v4-pro)。本文已给出精确改动，逐条照做，不要发挥。
> 
> **状态：全部任务已完成（2026-06）。** 本文保留为历史记录。P0-1、P0-2、P1-1、P1-2 所有修复均已应用到 `app/admin/page.tsx` 及关联文件。

## 背景与约束

- 范围:仅 `account` 分支的管理员后台。主体是单文件 `app/admin/page.tsx`(1174 行,7 个 tab 单页切换),外加 `lib/auth.ts` 与新增两个 API route。
- 冻结依赖:不准新增或升级任何 npm 包。
- 不准改动学生端:`app/me`、`app/u`、`app/loc`、`components/` 一律不动。学生端 UI 是 Figma 像素锁定的,任何全局 CSS 改动都不许碰(所以 iOS 修复用逐控件 utility,不要改 `app/globals.css`)。
- 除本文明列的行为变化外,保持现有逻辑不变。
- 行号以当前 account 分支为准,仅供定位;实际改动一律按给出的字符串做查找替换,改完一条后行号会漂移,后续条目重新按字符串定位。

## 任务总览

| 编号 | 优先级 | 文件 | 一句话 |
|---|---|---|---|
| P0-1 | 必修 | page.tsx | 3 处 `\u2026` 写进了 JSX 文本/属性,会原样显示乱码 |
| P0-2 | 必修 | page.tsx | 输入框 14px,iOS 聚焦会强制放大页面 |
| P1-1 | 建议 | page.tsx | tab 栏右侧渐变不贴边 + 切 tab 不自动滚入可视区 + 补 a11y |
| P1-2 | 建议 | auth.ts + 2 个新 route + page.tsx | 刷新即掉登录态 + 无登出入口 |

---

## P0-1 · 修复 `\u2026` 转义

原因:JSX 文本节点和属性双引号里不解析 `\u` 转义,这三处会原样显示反斜杠 u2026。直接用字符即可。

两次查找替换覆盖全部三处(605/615/733 行):

1. 把 `加载中\u2026` 全部替换为 `加载中…`(命中 takedown 加载态与 export 加载态两处)
2. 把 `placeholder="搜索姓名、英文名或短码\u2026"` 替换为 `placeholder="搜索姓名、英文名或短码…"`

不要动 858、953 行已经用真实 `…` 的地方,也不要动 `{...}` 里的 `\u2026`(那些在 JS 字符串中是正确的)。

验收:`grep -n '\\u2026' app/admin/page.tsx` 仅剩出现在 `{ ... }` JS 表达式里的条目(204/336/531/1121),JSX 文本与属性里 0 处。

---

## P0-2 · 修复 iOS 输入放大

原因:iOS Safari 对字号 <16px 的输入框聚焦时会自动缩放页面。后台活动当天会在手机上用,每次点输入框都跳。

做法:`app/admin/page.tsx` 内所有表单控件改成手机 16px、桌面维持 14px。这些控件的 className 都含唯一锚点 `px-3 py-2 text-sm`(全文件出现 9 次,全部在 `<input>`/`<textarea>` 上,按钮用的是 `px-4 py-2`,不会误伤)。

查找替换(全局,9 处):

- `px-3 py-2 text-sm` → `px-3 py-2 text-base sm:text-sm`

验收:`grep -c 'px-3 py-2 text-base sm:text-sm' app/admin/page.tsx` 等于 9;`grep -c 'px-3 py-2 text-sm' app/admin/page.tsx` 等于 0。

---

## P1-1 · 修复 tab 栏

三个问题:(a) 渐变遮罩写在 `overflow-x-auto` 滚动容器自己的 `::after` 上,绝对定位子元素会随内容滚动,不贴右边缘;(b) export 表里的重置按钮会程序切到第 7 个 tab 重置密码,窄屏下它在屏幕外,高亮条看不见;(c) tab 用裸 button,没有 tablist/tab 语义。

### 改动 1:Dashboard 加 ref 与滚动副作用

文件顶部 import 增加 `useRef`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
```

`Dashboard` 函数体开头(`return` 之前)加入:

```ts
const activeTabRef = useRef<HTMLButtonElement | null>(null);
useEffect(() => {
  activeTabRef.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
}, [tab]);
```

### 改动 2:替换整个 `<nav>...</nav>` 块

把渐变从滚动容器内挪到外层不滚动的 wrapper,并补 a11y 与 activeTabRef。用下面整块替换现有的 `<nav className="mx-auto flex max-w-5xl gap-0 overflow-x-auto px-4 ...">...</nav>`:

```tsx
<div className="relative">
  <nav
    role="tablist"
    className="mx-auto flex max-w-5xl gap-0 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
  >
    {TABS.map((t) => (
      <button
        key={t.id}
        ref={tab === t.id ? activeTabRef : null}
        type="button"
        role="tab"
        aria-selected={tab === t.id}
        onClick={() => onTabChange(t.id)}
        className={
          "shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors " +
          (tab === t.id
            ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
            : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300")
        }
      >
        {t.label}
      </button>
    ))}
  </nav>
  <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-8 bg-gradient-to-l from-white to-transparent dark:from-zinc-900/80" />
</div>
```

验收:窄屏(≤375px)横滑 tab 栏,右侧渐变始终钉在右缘;点 export 表里某行的重置按钮跳到重置密码后,tab 栏自动把重置密码滚到可视区。

---

## P1-2 · 会话校验 + 登出

现状:`loggedIn` 是 `useState(false)`,根组件 mount 时不校验已有的 `owk_admin` cookie(8h 有效),所以每次刷新都回登录页要重输口令;同时全后台没有任何登出入口,共用设备时 session 只能等 8h 自然过期。

复用现有 `verifyAdminSession()`,新增一个会话探测 GET 和一个登出 POST。

### 改动 1:`lib/auth.ts` 增加 clearAdminCookie

在 `setAdminCookie` 之后新增(镜像已有的 `clearStudentCookie`,但用 admin 的 `COOKIE_NAME`):

```ts
export function clearAdminCookie() {
  return {
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    path: "/",
    maxAge: 0,
  };
}
```

### 改动 2:新增 `app/api/admin/session/route.ts`

```ts
import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth";

export async function GET() {
  const authed = await verifyAdminSession();
  return NextResponse.json({ authed });
}
```

### 改动 3:新增 `app/api/admin/logout/route.ts`

```ts
import { NextResponse } from "next/server";
import { clearAdminCookie } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(clearAdminCookie());
  return response;
}
```

注:若同目录其他 admin route(如 `app/api/admin/persons/route.ts`)在文件顶部声明了 `export const runtime = "nodejs"`,这两个新 route 也照抄同一行,保持运行时一致。

### 改动 4:`AdminPage` 加 mount 校验

在 `AdminPage` 的 state 区(`const [loggedIn, setLoggedIn] = useState(false);` 附近)加:

```ts
const [checking, setChecking] = useState(true);

useEffect(() => {
  fetch("/api/admin/session")
    .then((r) => r.json())
    .then((d) => {
      if (d.authed) setLoggedIn(true);
    })
    .catch(() => {})
    .finally(() => setChecking(false));
}, []);
```

并加一个登出处理函数:

```ts
async function handleLogout() {
  try {
    await fetch("/api/admin/logout", { method: "POST" });
  } catch {
    /* empty */
  }
  setLoggedIn(false);
  setPassword("");
}
```

在 `if (!loggedIn)` 判断之前,先处理校验中的状态(避免有效会话刷新时闪一下登录页):

```tsx
if (checking) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <p className="text-sm text-zinc-500">加载中…</p>
    </div>
  );
}
```

最后把 Dashboard 的渲染改为传入登出回调:

```tsx
return <Dashboard tab={tab} onTabChange={setTab} onLogout={handleLogout} />;
```

### 改动 5:Dashboard 接收并渲染登出按钮

`Dashboard` 签名加上 `onLogout`:

```tsx
function Dashboard({ tab, onTabChange, onLogout }: { tab: TabId; onTabChange: (t: TabId) => void; onLogout: () => void }) {
```

header 里那行只有标题的 div,替换为标题 + 登出按钮:

```tsx
<div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
  <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">运营后台</h1>
  <button
    type="button"
    onClick={onLogout}
    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
  >
    登出
  </button>
</div>
```

验收:登录后刷新页面不再要求重输口令(有效会话直接进后台,期间显示加载中);点登出后回到登录页,且 cookie 已清(再刷新仍是登录页)。

---

## 收尾验收(全部任务做完后)

- `npm run lint` 通过,无新增报错。
- `npm run build` 通过(不新增依赖)。
- 手机真机过一遍:输入框聚焦不放大;tab 横滑渐变贴边;切 tab 自动滚入;刷新保持登录;登出可用。
- 学生端 `app/me`、`app/u`、`app/loc` 与 `app/globals.css` 的 git diff 为空。

---

## 附录:默认不执行,需 Isaac 明确放行

> 以下是判断类改动。除非 Isaac 在本节逐条标注「执行」,否则跳过整节,不要改动。

A. tab 重排与分组。按操作流改 `TABS` 顺序为:导入名单 · QR码 · 导出 · 重置密码(筹备发放)| 下架控制 · 位置编辑(现场运维)| 系统设置(配置)。

B. 改名与标签对齐。`位置编辑` 改为 `展位信息`;tab label 与页内 H2 对齐(导入名单/批量导入学生、导出/导出数据、QR码/QR码生成 三组统一措辞)。

C. 位置编辑/重置密码加选人入口。复用 takedown 的 `/api/admin/persons` 拉全量 + 搜索,选中后回填短码;位置编辑额外回显当前已存值,避免盲写覆盖。
