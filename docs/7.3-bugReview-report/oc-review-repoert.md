# wp-a 安全与可靠性评审报告

> **历史评审快照，不代表当前代码或风险状态。** 当前安全边界见 `docs/08_v1.1_工程基线与契约.md`；2026-08-06 安全修复及发布要求见 `docs/13_security-fix_生产部署交接.md`。

> **项目**：OWeek 个人主页系统（`msoweek.site`）
> **技术栈**：Next.js 16 App Router + Prisma 6 + Neon PostgreSQL + Cloudflare R2
> **部署**：Vercel（`main` 分支自动部署）
> **使用场景**：学校迎新周活动，周期 10–14 天，用户规模≤1000
> **威胁模型**：学生恶作剧、个人信息窥探、账号劫持，非企业级 APT 场景
> **评审原则**：基于项目实际场景评价，不过度套用企业冗余架构

---

## 一、项目概览

### 架构分层

```
┌──────────────┐     ┌──────────────┐
│  /loc/{code} │     │  /u/{code}   │
│  位置页       │     │  个人主页     │
└──────┬───────┘     └──────┬───────┘
       │                    │
       └────────┬───────────┘
                │
       ┌────────┴────────┐
       │  Next.js (Vercel) │
       │ ┌──────────────┐ │
       │ │ /api/* 22个   │ │
       │ │ /me /u /loc   │ │
       │ │ /admin        │ │
       │ └──────────────┘ │
       └───┬───────┬──────┘
           │       │
    ┌──────┘       └──────┐
    ▼                     ▼
┌─────────┐          ┌──────────┐
│  Neon   │          │R2 (S3)   │
│PostgreSQL│         │图片存储   │
└─────────┘          └──────────┘
```

### 双 cookie 认证体系

| Cookie | 身份 | 有效期 | 签名密钥 | JWT Payload |
|---------|------|--------|----------|-------------|
| `owk_session` | 学生 | 14 天 | `SESSION_SECRET` | `{ pid, role: "student" }` |
| `owk_admin` | 运营 | 8 小时 | `ADMIN_PASSWORD` | `{ role: "admin" }` |

均为 httpOnly + SameSite=Lax + 服务端 Set-Cookie（无 `document.cookie` / localStorage）。

### 22 个 API 端点

| 认证类型 | 端点 |
|----------|------|
| 无需认证 | POST `/api/auth/login`、POST `/api/admin/login`、GET `/api/settings?key=` |
| 学生认证 | GET/PATCH `/api/me`、POST `/api/me/images`、DELETE `/api/me/images`、POST `/api/upload-url`、POST `/api/favorites`、GET `/api/me/favorites`、POST `/api/auth/logout` |
| 管理认证 | GET `/api/admin/session`、POST `/api/admin/logout`、GET `/api/admin/persons`、POST `/api/admin/import`、GET `/api/admin/export`、POST `/api/admin/takedown`、POST `/api/admin/reset-password`、POST `/api/admin/location`、GET `/api/admin/qr/print`、GET/PATCH `/api/admin/settings` |

---

## 二、做得好的地方（保持现状）

| 方面 | 做法 |
|------|------|
| 密码存储 | `node:crypto scrypt` + `timingSafeEqual`，格式 `salt_hex:hash_hex` |
| 数据库安全 | Prisma ORM 无 raw SQL，图片计数用 Serializable 事务 + P2034 重试 |
| 图片上传 | 浏览器端压缩 → presigned URL 直传 R2，服务端不中转 |
| 图片权限 | key 以 `personId/` 前缀命名，服务端校验所有权 + URL 匹配 |
| 前台安全 | 无 `dangerouslySetInnerHTML`、`eval`、`new Function` |
| Session 设置 | 仅服务端 `Set-Cookie`，不经过 `document.cookie`（规避 Safari ITP 7 天限制） |
| 限流 | 学生登录按 IP + 用户名双维度限流，上传 URL 按用户限流 |
| Auth 失败 | 环境变量缺失时直接抛错，不回退到弱默认值 |
| 批量导入 | 事务化，唯一冲突返回 409 |
| XSS 防御 | React JSX 自动转义；QR 打印页面有 `escapeHtml()` |
| 密码不可恢复 | 导出不含密码 hash，重置返回明文一次后即不可逆 |

---

## 三、🔴 严重：活动前必须修

### 1. React 19.2.4 仍有未修复 RSC DoS 漏洞

| 漏洞 | CVSS | 说明 | 修复版本 |
|------|------|------|----------|
| CVE-2026-23864 | HIGH 7.5 | RSC DoS — 构造请求使 Server Function 崩溃/OOM | 19.2.4 ✅ |
| CVE-2026-23870 | HIGH ~7.5 | 另一条 RSC 攻击面，通过 Server Function 端点触发 OOM | **19.2.6** ❌ |

**当前 19.2.4 只修了第一批（1 月），第二批（CVE-2026-23870，5 月）需要 19.2.6。** 项目使用 Next.js Server Components/Server Actions，此攻击面是活的。

**修复**：升级 `react` + `react-dom` 到 `^19.2.6`。

### 2. 管理员密码直接当 JWT 签名密钥

`lib/auth.ts:18-20` — `getAdminSecret()` 返回 `new TextEncoder().encode(ADMIN_PASSWORD)`。

`ADMIN_PASSWORD` 同时是登录凭证和 JWT HS256 签名密钥。当前管理密码 `oweek26`（7 位全小写，约 36 bits 熵），远低于 HS256 的安全要求。获取到 admin JWT 后可离线爆破签名密钥，伪造任意管理员会话。

**影响**：完全接管 admin → 批量导出学生数据、重置密码、下架页面。

**修复**：新增 `ADMIN_JWT_SECRET`（`openssl rand -base64 32`）专用于 JWT 签名；`ADMIN_PASSWORD` 仅用于登录挑战。

### 3. 无 CSRF 防护

所有 POST/PATCH/DELETE 端点仅依赖 cookie 认证，未验证 CSRF token 或 origin header。`SameSite=Lax` 能挡大部分跨站 POST，但在以下场景不足：
- 共享设备上的已登录会话
- 微信/QQ 等第三方 App 内置浏览器（sameSite 行为不一致）
- 通过 `GET` 触发的状态变更（`SameSite=Lax` 允许顶级导航带 cookie）

**影响**：可诱导已登录学生在不知情下修改个人资料、收藏/取消收藏他人。

**修复**：为学生和管理员 session 各绑定一个 CSRF token，通过独立端点下发（如 `GET /api/auth/csrf`），所有变更状态请求校验 `X-CSRF-Token` header。

### 4. `.env` 缺少 `SESSION_SECRET`，学生登录 100% 崩溃

`lib/auth.ts:102` — `getSessionSecret()` 调用 `getRequiredEnv("SESSION_SECRET")`，缺少时直接 throw。

当前 `.env` 中 **未定义 `SESSION_SECRET`**。本地开发时学生登录 API 立即 crash。如果 Vercel 环境变量也未设置，生产环境同样崩溃。

**修复**：立即生成并写入 `.env`：
```bash
openssl rand -base64 48
```
同时在 Vercel 项目 Settings → Environment Variables 中设置。

### 5. `.env` 以明文生产凭证躺在开发机磁盘

文件包含生产环境的数据库连接串、R2 访问密钥、管理员密码等敏感信息。虽然 `.gitignore` 已忽略 `.env*` 文件使其未进入 git，但：
- 笔记本电脑屏幕窥视、未加密备份、恶意软件均可窃取
- 桌面文件在系统备份中会明文保存

**修复**：本地开发完成后清除 `.env` 中的生产值；生产密钥仅通过 Vercel Dashboard / `vc env add` 设置；本地仅保留开发用值。

---

## 四、🟠 高：建议开活动前修

| # | 问题 | 详情 | 位置 |
|---|------|------|------|
| 6 | 管理员密码过弱 | `oweek26` — 7 位全小写，字典模式。配合问题 #2（密码=签名密钥）可离线伪造 admin JWT | `.env` |
| 7 | 无审计日志 | 重置密码、下架、导入等 admin 操作全无记录。出事无法溯源 | 全部 admin 路由 |
| 8 | admin 状态变更端点无限流 | reset-password / import / takedown / location / settings 均无速率限制。拿到 admin cookie 后可瞬间批量操作 | 对应 `app/api/admin/*` |
| 9 | 无安全响应头 | 无 CSP、HSTS、X-Content-Type-Options | `next.config.ts` |
| 10 | 无会话撤销机制 | 学生 14d / Admin 8h 会话 JWT 无 `jti`，签发后无法中途作废 | `lib/auth.ts` |

---

## 五、🟡 中：有余力时修

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| 11 | 内存限流器无过期条目清理 | `lib/rate-limit.ts` | `Map` 只增不删，长时间运行缓慢膨胀。新增条目时异步清除过期记录即可 |
| 12 | R2 presigned URL 无大小限制 | `lib/r2.ts:38-49` | 预设 URL 不含 `ContentLength`，可上传任意大文件。建议在 `createPresignedUploadUrl` 中传入 `ContentLength` 参数 |
| 13 | 多个 API 缺顶层 try/catch | settings / takedown / location / export / reset-password | 未捕获异常直接 500，无语义化错误信息 |
| 14 | 管理面板静默吞错误 | `app/admin/page.tsx` 多处 `.catch(() => {})` | 网络/权限失败显示为空列表，运营会误判操作成功 |
| 15 | 客户端 CSV 解析不支持引号/逗号 | `app/admin/page.tsx:65-78` | 使用 `line.split(",")` 而非 RFC 4180 标准解析，英文名含逗号时错位 |
| 16 | 登录输入无 maxLength | `app/LoginForm.tsx` | 大 payload 消耗 Lambda 内存和解析时间，轻微 DOS 向量 |
| 17 | 服务端 `redirect()` 未包裹 try/catch | `app/u/[code]/page.tsx`、`app/loc/[code]/page.tsx` | 数据库异常时未捕获，冒泡到 500 |
| 18 | 无健康检查端点 | — | 部署后无法自动验证 DB/R2/凭证完整性 |
| 19 | 响应格式不统一 | 跨 API 路由 | 有的返回 `{ ok: true, ... }`，有的直接返回数据，客户端难以统一处理 |
| 20 | 头像 URL 校验禁止 query 参数 | `app/api/me/route.ts:32-33` | `isValidAvatarUrl` 要求 `!value.includes("?")`，影响未来 R2 URL 签名 |

---

## 六、可靠性评审要点

后台代理按 P0–P3 分级（P0=阻塞，P3=代码异味）：

```
P0: 0 个   P1: 3 个   P2: 14 个   P3: 13 个
```

### P1（必须修）

1. **SESSION_SECRET 缺失**（复用第 4 项）— 学生登录 100% 崩。
2. **服务器组件中 `redirect()` 前 session 校验未包裹 try/catch**（`app/page.tsx:15-18`）— 数据库异常时冒泡到 500 页面，不显示登录错误。
3. **API 响应格式不统一** — 影响前端错误处理的可靠性。

### 主要 P2

- 空 catch 块：管理面板 `fetch` 失败静默吞掉，用户看到空列表或无响应。
- 日志：全应用仅一个 `console.error`（在 import 路由中），生产排查基本靠猜。
- 登录表单无 maxLength：大 payload 可导致 Lambda 超时。
- CSV 解析错误：手动粘贴 CSV 到管理面板时，含逗号的字段解析错位后提交，API 会接收错误数据。
- 收藏 API 中非 P2002/P2025 错误被重新抛出后无处理，未捕获 Promise rejection 到框架层。

---

## 七、依赖安全性

| 依赖 | 当前版本 | 结论 |
|------|----------|------|
| react / react-dom | 19.2.4 | 🔴 需升到 **19.2.6**（CVE-2026-23870） |
| next | 16.2.9 | ✅ 安全（CVE-2026-44574/581/575/27978 已在 16.2.5 修复） |
| @prisma/client | ^6.19.3 | ✅ 安全（6.19.3 即为修复 `effect` 依赖漏洞的版本） |
| @prisma/adapter-neon | ^6.19.3 | ✅ 同上 |
| @neondatabase/serverless | ^1.1.0 | 🟡 注意 break change：SQL 模板函数不再支持函数调用形式（`sql(...)`），只能用模板字符串（`` sql`...` ``） |
| jose | ^6.2.3 | ✅ 安全（CVE-2024-28176 影响 ≤4.x，CVE-2025-45767 被维护者驳回） |
| @aws-sdk/client-s3 / s3-request-presigner | ^3.1075.0 | ✅ 安全（fast-xml-parser 漏洞已在 3.1036.0+ 修复） |
| nanoid | ^5.1.15 | ✅ 安全（CVE-2024-55565 已在 5.0.9 修复） |
| qrcode / browser-image-compression | — | ✅ 无已知漏洞 |

---

## 八、按优先级排行动计划

### 第 1 优先级：立刻做（阻塞上线）

1. **升级 React** `react` / `react-dom` → `^19.2.6`
2. **生成并设置 SESSION_SECRET** → 写入 `.env` + Vercel 环境变量
3. **拆分 ADMIN_JWT_SECRET** → 新增环境变量，`lib/auth.ts` 中新增 `getAdminJwtSecret()`，修改 `getAdminSecret()` 使用新密钥
4. **清理本地 `.env`** → 生产凭证仅放 Vercel，本地 `.env` 保留开发用值或删除

### 第 2 优先级：开活动前做

5. **CSRF 防护** — 新增 `GET /api/auth/csrf` 端点下发 token，所有变更状态请求校验 `X-CSRF-Token`
6. **安全响应头** — `next.config.ts` 中添加 CSP（限制 script-src / img-src 到 R2 域）、Strict-Transport-Security、X-Content-Type-Options
7. **Admin 端点限流** — 在 reset-password / import / takedown / location / settings 中复用 `checkRateLimit`
8. **审计日志** — 在 admin 操作中增加结构化 `console.log`，记录操作类型、目标人、时间戳
9. **统一 API 响应** — 对所有成功响应统一使用 `{ ok: true, ... }` 或标准化 error 对象格式
10. **`redirect()` 加 try/catch** — 服务器组件 session 校验包裹 try/catch，优雅回退

### 第 3 优先级：有余力做

11. 内存限流器周期性清理过期条目
12. R2 presigned URL 加 ContentLength 参数
13. 客户端 CSV 解析器支持 RFC 4180（引号、逗号、BOM）
14. 加 `GET /api/health` 健康检查端点
15. 管理面板网络失败显示错误 UI 而非静默吞掉
16. 登录表单加 `maxLength` 约束

---

## 九、总体评估

这个项目在认证、数据库访问、文件上传这些核心面上是健康的。prisma 保证了无 SQL 注入，无任何 `dangerouslySetInnerHTML` / eval / cookie 操作，密码正确使用 scrypt + timingSafeEqual，文件上传不走服务端中转。整体结构清晰，没有常见的低级漏洞。

**真正需要紧张的三件事**：

1. **React 19.2.4 仍有 CVE-2026-23870 RSC DoS 漏洞** — 升级即可解决
2. **SESSION_SECRET 缺失** — 加一个环境变量即可，但漏掉会导致学生登录完全不可用
3. **Admin JWT 签名密钥与密码混用** — 拆分即可

这三件事任一在活动期间爆发都会造成实际故障或越权。其余问题按学校活动场景、有限用户数的前提下可依次排期处理，不需要大改架构。
