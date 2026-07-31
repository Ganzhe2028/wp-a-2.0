# OWeek 个人主页系统 · v2.0

新生在线编辑个人主页，OWeek 期间通过 NFC 碰一碰或二维码扫码查看：墙上明信片→位置页，展位展板→主页。

## 一句话

把线下碰一碰变成一场认识人的旅途——先碰明信片找到对方的展位在哪，走过去当面聊，再碰展板看主页。学生凭账号密码登录，一次登录活动期内全程不掉。

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 16 (App Router) + React + TypeScript |
| 数据库 | PostgreSQL (Neon Serverless)，Prisma ORM v6 |
| 图片存储 | Cloudflare R2（S3 兼容，presigned URL 直传） |
| 图片压缩 | browser-image-compression（浏览器端） |
| 短码/Token | nanoid |
| 二维码 | qrcode |
| 会话 | jose (JWT) |
| 样式 | Tailwind CSS，手机端优先 |
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
cp .env.example .env        # PowerShell 用 copy .env.example .env
npm install
npx prisma migrate dev
npm run dev
```

如果 `npx prisma` 报权限错误，用管理员身份打开终端。如果 `npm install` 超时（国内网络），先设镜像：

```bash
npm config set registry https://registry.npmmirror.com
```

### 环境变量

复制 `.env.example`（或手动创建 `.env`）：

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
npx prisma migrate dev    # 建表
npm run dev               # 启动开发服务器 → http://localhost:3000
```

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
┌──────────────┐     ┌──────────────┐
│  墙上明信片    │     │  展位展板     │
│  /loc/{code}  │     │  /u/{code}   │
│  位置页       │     │  个人主页     │
└──────┬───────┘     └──────┬───────┘
       │                    │
       └────────┬───────────┘
                │
       ┌────────┴────────┐
       │    Vercel        │
       │  Next.js App     │
       │  ┌─────────────┐ │
       │  │ /api/*      │ │
        │  │ /me         │ │
        │  │ /u/[code]   │ │
        │  │ /loc/[code]  │ │
       │  │ /admin       │ │
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
  page.tsx                   # 首页：登录表单 + 管理员入口
  LoginForm.tsx              # 登录表单（客户端）
  me/
    page.tsx                 # 个人中心：编辑主页 + 我的收藏
    MeEditForm.tsx           # 编辑表单（客户端）
    FavoritesList.tsx        # 我看见了谁列表（客户端）
  u/[code]/
    page.tsx                 # 公开主页（SSR，需登录）
    ImageLightbox.tsx         # 全屏灯箱（客户端）
    ImageGallery.tsx          # 图片网格 + 灯箱触发（客户端）
  loc/[code]/
    page.tsx                 # 位置页（SSR，需登录）
    FavoriteButton.tsx        # 收藏按钮（客户端，服务端数据）
  admin/page.tsx             # 运营后台（口令登录）
  api/
    auth/login/route.ts      # POST 学生登录 → session cookie
    auth/logout/route.ts     # POST 清 session cookie
    me/route.ts              # GET / PATCH 自己数据（session 鉴权）
    me/images/route.ts       # POST 保存 / DELETE 删除图片记录
    upload-url/route.ts      # POST 获取 R2 presigned PUT URL
    favorites/route.ts       # POST 收藏/取消 toggle
    me/favorites/route.ts    # GET 我收藏的人列表
    admin/login/route.ts     # POST 口令登录
    admin/import/route.ts    # POST 批量事务导入（生成账号密码）
    admin/location/route.ts  # POST 编辑位置页
    admin/takedown/route.ts  # POST 下架开关
    admin/export/route.ts    # GET 导出 CSV（含用户名、短码、主页、展位链接）
    admin/session/route.ts   # GET 校验当前 admin 会话
    admin/logout/route.ts    # POST 清除 admin cookie 登出
    admin/persons/route.ts   # GET 所有人列表
    admin/settings/route.ts  # GET/PATCH 系统设置
    admin/reset-password/route.ts  # POST 重置学生密码
    admin/qr/print/route.ts  # GET 批量打印 QR 码
    settings/route.ts        # GET 公开读单个设置
components/
  AvatarUploader.tsx          # 头像上传（压缩 + presigned 直传）
  ImageGrid.tsx               # 多图上传网格（最多 4 张，含删除）
lib/
  prisma.ts                  # Prisma client 单例
  r2.ts                      # R2 S3 client + presigned URL
  auth.ts                    # 学生 session / admin session / 密码哈希
  code.ts                    # nanoid 短码 + 密码生成
  csv.ts                     # CSV RFC 4180 转义 helper
  rate-limit.ts              # 登录限流（内存滑动窗口）
  qr.ts                      # 二维码生成
prisma/
  schema.prisma              # Person / Image / LocationCard / Favorite / SystemSetting
  migrations/
app/generated/prisma/        # Prisma 生成客户端（已提交 git）
```

## 核心设计决策

- **账号体系**：学生凭用户名+密码登录，session cookie（httpOnly JWT，14 天）。编辑和收藏基于登录身份
- **两套 cookie 独立**：`owk_session`（学生）和 `owk_admin`（运营）互不干扰
- **收藏单向静默**：A 收藏 B，只有 A 能看到；B 不通知、不显示次数、不显示是谁
- **图片直传 R2**：前端压缩后通过 presigned URL 直传，不经过服务端
- **图片 key 由服务端生成**：前端必须保存 `/api/upload-url` 返回的真实 `key`，删除时才会正确清理 R2 对象
- **短码复用**：同一 `code` 同时服务于 `/u/{code}`（主页）和 `/loc/{code}`（位置页）
- **位置页是兜底**：即使某人没布置主页，位置页依然在，保证平等曝光
- **bio 按 code point 计数**：上限 80，不是 byte 也不是 char
- **密码不可逆**：存库的是 scrypt hash，明文只在生成/重置那一刻出现一次
- **Auth fail closed**：`ADMIN_PASSWORD` 和 `SESSION_SECRET` 缺失时直接报错，不使用默认 JWT 密钥
- **批量导入事务化**：导入账号时任一行失败会整批回滚，不返回半成功账号
- **主页自动发布**：学生上传头像并保存资料后，主页自动变为可见；管理员仍可通过下架开关隐藏特定页面
- **微信 UA 引导**：登录页检测微信内置浏览器，提示学生在 Safari/系统默认浏览器中打开，避免微信与 Safari cookie jar 不一致导致「登过却显示未登录」

## 验证 Check

| 检查项 | 命令/方法 |
|---|---|
| 数据库连通 | `npx prisma db push --dry-run` |
| Prisma 客户端 | `npx prisma generate`（新 clone 后必须跑一次） |
| 类型检查 | `npx tsc --noEmit` |
| 构建 | `npm run build` |
| 生产启动 | `npm start` |

## 版本演进

v2.0 在 v1.0 基础上新增：
- **账号体系**：学生凭用户名+密码登录，session cookie 保持 14 天
- **服务端收藏**：替换 v1.0 的 localStorage 收藏，挂在账号上，单向静默
- **个人中心 `/me`**：编辑主页 + 收藏列表同页展示

## v2.0 不做

评论、点赞、社交链接、配对算法、消息通知、学生自助找回密码

## 文档

- [PRD – 产品需求文档](docs/01_PRD_OWeek个人主页系统_v1.0.md)
- [开发文档 v1.0 – 接口契约与构建顺序](docs/02_开发文档_OWeek个人主页系统_v1.0.md)
- [开发文档 v2.0 – 账号系统迁移](docs/04_开发文档_v2.0_账号系统迁移.md)
- [操作手册 – 新人接手指南](docs/03_操作手册.md)
- [AGENTS.md](AGENTS.md) – coding agent 工作规范

## 线上

生产环境：**[msoweek.site](https://msoweek.site)**（Vercel，`main` 分支 push 自动部署）
