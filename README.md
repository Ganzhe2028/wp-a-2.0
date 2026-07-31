# O—WEEK / 26 · 活动主页系统

新生凭账号登录后完成两份作品——DAY 1 照片拼贴（头像 + 14 图）和 DAY 3 小瓶子（64 项打分）——提交后解锁浏览其他人的对应分区；现场通过 NFC 碰一碰或二维码直达匿名作品页和礼包交接页。

## 一句话

先留下你的一点点，再去看别人的——互解锁的 O-Week 资料交换。学生凭账号密码登录，一次登录活动期内全程不掉。

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 16 (App Router) + React + TypeScript |
| 数据库 | PostgreSQL (Neon Serverless)，Prisma ORM v6（`engineType = "client"` + `@prisma/adapter-neon`） |
| 图片存储 | Cloudflare R2（S3 兼容，presigned URL 直传） |
| 图片压缩 | browser-image-compression（浏览器端） |
| 短码/Token | nanoid |
| 二维码 | qrcode |
| 会话 | jose (JWT) |
| 样式 | Tailwind CSS v4（CSS-first）+ `app/globals.css` 的 ow- 设计系统 |
| 部署 | Vercel + Cloudflare DNS |

## 快速开始

### 前置条件

- **Node.js 18+** — [nodejs.org](https://nodejs.org) 下载 LTS 版
- **Neon PostgreSQL 数据库** — [neon.tech](https://neon.tech) 免费注册
- **Cloudflare R2 存储桶** — [dash.cloudflare.com](https://dash.cloudflare.com) 登录后左侧 R2

### Windows 特别注意

Windows 下推荐用 **Git Bash**（装 Git 时自带）或 **PowerShell**：

```bash
# Git Bash / PowerShell 通用
cp .env.example .env.local  # PowerShell 用 copy .env.example .env.local
npm install
DOTENV_CONFIG_PATH=.env.local npx prisma migrate deploy
npm run dev
```

如果 `npx prisma` 报权限错误，用管理员身份打开终端。如果 `npm install` 超时（国内网络），先设镜像：

```bash
npm config set registry https://registry.npmmirror.com
```

### 环境变量

复制 `.env.example` 为 `.env.local`（或手动创建该文件）：

```bash
DATABASE_URL=           # Neon pooled 连接串（查询用）
DIRECT_URL=             # Neon direct 连接串（仅 prisma migrate）
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=     # R2 公开访问域名
ADMIN_PASSWORD=         # 运营后台口令
SESSION_SECRET=         # 学生 session 签名密钥（至少 32 字节，openssl rand -base64 48 生成）
APP_BASE_URL=           # 如 https://xxx.top，导出链接拼前缀用
```

### 安装与运行

```bash
npm install
npx prisma generate       # 生成本平台 Prisma 客户端（已提交预生成版本）
DOTENV_CONFIG_PATH=.env.local npx prisma migrate deploy # 应用已提交迁移
npm run dev               # 启动开发服务器 → http://localhost:3000
```

Next.js 会读取 `.env.local`，但 Prisma CLI 默认只读取 `.env`。本项目使用 `.env.local` 时，所有 Prisma 迁移命令都必须带上 `DOTENV_CONFIG_PATH=.env.local`；新增 schema 变更时才用 `npx prisma migrate dev --name <变更名>` 创建迁移。

⚠️ `npm run build` 会执行 `prisma generate`，同样只读 `.env`。本地构建前先 `set -a; source .env.local; set +a; npm run build`。

### 部署

1. GitHub 建仓，推代码
2. Neon 建库 → 拿到两个连接串
3. Cloudflare R2 建桶 → 开公开访问 + 配 CORS → 拿到 S3 密钥
4. Vercel 连仓 → 填环境变量 → 部署

生产地址：`https://msoweek.site`

⚠️ Vercel 部署特别注意：
- Prisma 使用 `engineType = "client"` + `@prisma/adapter-neon`，**没有原生查询引擎二进制**，因此不再需要 `binaryTargets`、`outputFileTracingIncludes`、`vercel.json` 的 `functions.includeFiles` 以及 `--webpack` 来规避引擎打包问题
- `dotenv` 必须在 `dependencies` 里（不在 `devDependencies`），否则 Vercel 生产构建时 `prisma.config.ts` 会找不到 `dotenv/config`
- 生成的 Prisma 客户端（`app/generated/prisma/`）**仍然提交到 git**，保证构建可复现，但生成产物中不再包含 `.so.node` / `.dylib.node` 引擎二进制
- 当前 build script 仍保留 `--webpack`（历史遗留），理论上改回默认 Turbopack 也能工作；如需切换请本地验证后再改

## 系统架构

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  NFC 展板     │     │  二维码/链接  │     │  NFC 礼包     │
│ /nfc/{code}  │     │  /u/{code}   │     │/package/{code}│
│ 匿名作品页    │     │  作品双tab页  │     │  仅姓名页     │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └────────┬───────────┴────────────────────┘
                │
       ┌────────┴────────┐
       │    Vercel        │
       │  Next.js App     │
       │  ┌─────────────┐ │
       │  │ /            │ │  登录（账号+密码）
       │  │ /home        │ │  DAY 1 / DAY 3 / BROWSE 三入口
       │  │ /day1 /day3  │ │  两个作品编辑器
       │  │ /browse      │ │  互解锁目录
       │  │ /admin       │ │  运营后台
       │  │ /api/*       │ │
       │  └─────────────┘ │
       └───┬───────┬──────┘
           │       │
    ┌──────┘       └──────┐
    ▼                     ▼
┌────────┐          ┌──────────┐
│  Neon   │          │  R2 (S3) │
│PostgreSQL│         │  图片存储 │
└────────┘          └──────────┘
```

## 项目结构

```
app/
  page.tsx                   # 登录页（已登录 redirect /home）
  LoginForm.tsx              # 登录表单（客户端）
  home/page.tsx              # 学生主控台：DAY 1 / DAY 3 / BROWSE 三卡
  day1/                      # DAY 1 照片拼贴编辑器（头像 + 14 图）
  day3/                      # DAY 3 小瓶子编辑器（2 × 32 项，0–5 打分）
  browse/                    # 互解锁目录（Senior Group / Learners）
  u/[code]/page.tsx          # 作品页（DAY 1 / DAY 3 双 tab，需登录，互解锁）
  nfc/[code]/page.tsx        # NFC 直达匿名作品页（公开，无跨用户入口）
  package/[code]/page.tsx    # 礼包交接页（公开，黑底仅姓名）
  me/page.tsx                # 仅 redirect → /home（旧个人中心已退役）
  submitted/day1/page.tsx    # 仅 redirect → /day1
  admin/page.tsx             # 运营后台（口令登录，Dashboard/Accounts/Audit/Settings）
  api/
    auth/login/route.ts      # POST 学生登录 → session cookie
    auth/logout/route.ts     # POST 清 session cookie
    me/route.ts              # GET / PATCH 自己数据（session 鉴权，头像 key 归属校验）
    me/images/route.ts       # POST 保存 / DELETE 删除图片记录（14 上限，Serializable 事务）
    me/submissions/route.ts  # GET 提交状态 / PATCH saveDay3·submitDay1·submitDay3
    upload-url/route.ts      # POST 获取 R2 presigned PUT URL
    local-upload/route.ts    # 本地开发磁盘存储（LOCAL_UPLOAD_DIR，替代 R2）
    admin/login|logout|session/route.ts
    admin/import/route.ts    # POST 批量事务导入（生成账号密码）
    admin/export/route.ts    # GET 导出 CSV（chineseName,englishName,username,code,homepage）
    admin/persons/route.ts   # GET 列表 / PATCH 编辑 / DELETE 删除账号
    admin/settings/route.ts  # GET / PATCH 系统设置（六个活动开关）
    admin/reset-password/route.ts  # POST 重置学生密码
    admin/qr/print/route.ts  # GET 批量打印 QR 码（每人一张 /u 码）
    settings/route.ts        # GET 公开读单个设置
components/
  OweekHeader.tsx            # 三栏导航头（返回 / 标题 / action）
  AvatarUploader.tsx         # 头像 tile 上传（压缩 + presigned 直传 + 失败重试卡）
  ImageGrid.tsx              # 图片网格（占位格 + 删除 + 失败重试卡）
  SessionExpired.tsx         # 401 会话过期卡
lib/
  prisma.ts                  # Prisma client 单例
  r2.ts                      # R2 S3 client + presigned URL
  auth.ts                    # 学生 session / admin session / 密码哈希
  flow.ts                    # DAY1_PROMPTS / DAY3_SECTIONS / parseDay3Answers
  event-settings.ts          # SystemSetting 读取（settingEnabled）
  code.ts / csv.ts / rate-limit.ts / qr.ts
prisma/
  schema.prisma              # Person / Image / LocationCard(遗留) / Favorite(遗留) / SystemSetting
  migrations/
app/generated/prisma/        # Prisma 生成客户端（已提交 git）
```

## 核心设计决策

- **活动流双作品**：DAY 1 = 照片拼贴（头像 + 14 图，满 15/15 才能提交）；DAY 3 = 小瓶子（64 项 0–5 打分，可部分提交）
- **互解锁浏览**：自己提交了 Day N 才能看别人的 Day N；权限由 viewer 提交状态决定，不由对方是否填写决定
- **提交即只读**：提交后默认只读；admin 打开 `allowEdit` 开关后才可继续编辑（重复提交仍 409）
- **匿名优先**：`showNames` 关闭时全站姓名渲染为 `#@!&%$?!` 符号 ID；`/nfc/{code}` 永远匿名
- **六个活动开关**（SystemSetting，admin Dashboard 控制）：`day1Open` `day3Open` `allowEdit` `showNames` `profileComplete` `navEnabled`，另有五个一键预设（DAY 1 创作 / DAY 3 创作 / 活动前浏览 / 游戏进行 / 找礼包）
- **NFC 永远可达**：`/nfc/{code}` 和 `/package/{code}` 公开且无登录门槛，不受 `navEnabled` 影响
- **账号体系**：学生凭用户名+密码登录，session cookie（httpOnly JWT，14 天，服务端 Set-Cookie，Safari ITP 免疫）
- **两套 cookie 独立**：`owk_session`（学生）和 `owk_admin`（运营）互不干扰
- **图片直传 R2**：前端压缩后通过 presigned URL 直传，不经过服务端；`key` 首段即 personId，`/api/me` 和 `/api/me/images` 均校验 key 归属与 URL 相等
- **密码不可逆**：存库的是 scrypt hash，明文只在生成/重置那一刻出现一次
- **Auth fail closed**：`ADMIN_PASSWORD` 和 `SESSION_SECRET` 缺失时直接报错，不使用默认 JWT 密钥
- **批量导入事务化**：导入账号时任一行失败会整批回滚，不返回半成功账号
- **微信 UA 引导**：登录页检测微信内置浏览器，提示学生在 Safari/系统默认浏览器中打开，避免微信与 Safari cookie jar 不一致导致「登过却显示未登录」

## 验证 Check

| 检查项 | 命令/方法 |
|---|---|
| 数据库连通 | `DOTENV_CONFIG_PATH=.env.local npx prisma migrate status` |
| Prisma 客户端 | `npx prisma generate`（新 clone 后必须跑一次） |
| 类型检查 | `npx tsc --noEmit` |
| Lint | `npm run lint` |
| 构建 | `set -a; source .env.local; set +a; npm run build` |
| Harness 审计 | `npm run audit:harness` |
| 一键全量 | `npm run verify:local` |
| 生产启动 | `npm start` |

## 版本演进

- **v1.0**：个人主页 + 位置页 + localStorage 收藏
- **v2.0**（2026-06）：账号体系（session cookie）、服务端收藏、`/me` 个人中心
- **v3.0**（2026-07-30，commit 3673cf8）：活动流改版——DAY 1 / DAY 3 双作品、互解锁浏览、匿名化、`/nfc` `/package` 落地页、admin 后台重写、图片上限 4→14；`/me` 退役为 redirect
- **v3.1**（2026-07-31）：对齐 Figma WP26 设计稿——设计 token（#FF5311、4/14/16/12 圆角、Inter）、六开关语义（新增 `allowEdit`/`profileComplete`/`navEnabled`，移除 `browseOpen`/`nfcEnabled`）、上传失败/会话过期状态卡；`/loc` 位置页与收藏功能整体下线（详见 `docs/08`）

## 不做

评论、点赞、社交链接、配对算法、消息通知、学生自助找回密码、收藏（v3.1 起移除）

## 文档

- [操作手册 – 新人接手指南](docs/03_操作手册.md)
- [UI 差距分析 + 执行结果 – Figma WP26 对齐](docs/08_UI差距分析_WP26设计稿对齐.md)
- [AGENTS.md](AGENTS.md) – coding agent 工作规范
- 历史文档（已被活动流改版取代，仅供溯源）：[PRD v1.0](docs/01_PRD_OWeek个人主页系统_v1.0.md) · [开发文档 v1.0](docs/02_开发文档_OWeek个人主页系统_v1.0.md) · [开发文档 v2.0](docs/04_开发文档_v2.0_账号系统迁移.md) · [admin 界面修复](docs/05_admin_界面修复_v1.md) · [beta 交接](docs/06_交接文档_beta阶段.md)

## 线上

生产环境：**[msoweek.site](https://msoweek.site)**（Vercel，`main` 分支 push 自动部署）
