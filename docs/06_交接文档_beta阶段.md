# OWeek 个人主页系统 · Beta 阶段交接文档

> 写给接手 UI/UX 实现的同学。你的主要任务是：在已经跑通的账号系统 + 后台基础上，把 Figma 设计「Welcom👀n」实际落到 Next.js + Tailwind 里。

---

## 0. 待做清单（接手后要干的活）

按优先级排列：

| # | 任务 | 类型 | 涉及文件 | 状态 |
|---|---|------|---------|------|
| 1 | **UI 更新 + 移动端适配** | 前端 | 全部页面组件、`globals.css`、Tailwind 配置 | 待做 |
| 2 | **加载动画 / 页面转场** | 前端 | `layout.tsx`、各 page.tsx、可能新增动画组件 | 待做 |
| 3 | **密码复杂度升级** | 后端 | `lib/code.ts`（`newPlainPassword` 改字母表 + 长度） | ✅ 已完成 |
| 4 | 收藏夹独立路由页（可选） | 前端 | 新增 `app/collection/page.tsx`，从 `/me` 拆出 | 可选 |

下面分节详述每项的上下文和约束。

### 任务 1：UI 更新 + 移动端适配

当前所有页面是灰色石头调的功能占位 UI。Figma 设计「Welcom👀n」已经在 `monk/index.html` 有可交互原型，设计 token（颜色/字体/圆角/动画参数）已从 Figma REST API + Plugin API 完整提取（见 §8）。

关键约束：
- Figma 视口是 **MacBook 14" (1512×982)**，没有移动端设计稿。需要你自己做响应式断点和移动端布局决策。
- 设计**没有用 Auto Layout**，所有元素是 FIXED 手动定位。padding/gap 需要从绝对坐标差值推算。
- 移动端优先——用户全是手机碰 NFC / 扫码打开的。桌面端是 bonus。

### 任务 2：加载动画 / 页面转场

Figma 原型定义了 5 段转场动画（详见 §8.3），包括 PUSH 方向推入、fade 淡入、CUSTOM_SPRING 弹簧动画。这些需要在 Next.js 页面切换时实现。

约束：
- App Router 的页面间切换默认没有动画。可以用 CSS `view-transition-api`（Chrome/Safari 已支持）或手动管理 `animate.css` / Framer Motion 等。
- 但 **Framer Motion 是新依赖**，违反技术栈冻结原则——确认真的需要再加。
- MVP 最低要求：页面切入时有个基本过渡，别赤裸跳变。按钮 hover/click 有反馈。
- 加载态：图片上传、收藏 toggle、表单提交时的 loading 指示器——当前这些地方没有 loading 动画，做了体验提升明显。

### 任务 3：密码复杂度升级（已完成）

**当前实现**：`lib/code.ts` 使用独立的 `PRINTABLE_PASSWORD_ALPHABET`：

```ts
const PRINTABLE_PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*-_+=?";
const generatePassword = customAlphabet(PRINTABLE_PASSWORD_ALPHABET, 12);
export function newPlainPassword(): string { return generatePassword(); }
```

- 12 位长度，大小写 + 数字 + 安全符号
- 排除易混淆字符（`0/O/1/l/I`）和难手输符号（`|\'`";:,.<>/()[]{}`）
- 约 69^12 种组合，配合 scrypt 可抗离线暴力破解
- 登录接口已加 rate limiting（学生：IP 15 分钟 20 次、用户名 15 分钟 5 次；admin：IP 15 分钟 10 次）

> 纸条排版需预留足够宽度；旧密码仍可登录，重置/新导入自动使用新规则。

### 任务 4（可选）：收藏夹独立路由页

**当前状态**：收藏列表嵌在 `/me` 页面底部（`FavoritesList.tsx`），和编辑表单挤在同一页。

**如果要做**：新建 `app/collection/page.tsx`，把收藏列表拆出来作为独立路由。同时在 `/me` 页面的导航栏加一个入口。

无技术难度——API 已就绪（`GET /api/me/favorites`），纯前端页面拆分。主要看怎么设计：
- 列表项展示什么信息（头像？姓名？年级？短码？）
- 点进去是跳到主页还是位置页
- 空状态设计（「还没有收藏任何人」的视觉）
- 导航：`/me` ↔ `/collection` 之间的来回

这个不急，UI 主体搞完再做都行。

---

## 1. 系统是干嘛的

一句话：新生在线编辑个人主页，OWeek 期间通过 NFC 碰一碰或扫码互相发现。

物理叙事是核心——两次碰：
1. **墙上明信片** → 碰出**位置页**（/loc/{code}）：告诉你在哪个房间哪个座位找到这个人
2. **展位展板** → 碰出**个人主页**（/u/{code}）：头像、姓名、年级、自我介绍、图片

所以系统有 4 个前端页面 + 1 个运营后台。150 个新生，每人一个短码，两张 NFC 标签。

---

## 2. 当前状态：Beta 完成

后端和业务逻辑全部就绪，**不需要你碰**：

| 已完成 | 说明 |
|--------|------|
| ✅ 账号体系 | 学生凭用户名+密码登录，session cookie (JWT, 14 天)，全程不掉线 |
| ✅ 登录/登出 | `/api/auth/login`、`/api/auth/logout` |
| ✅ 个人中心 | `/me` 页面：编辑主页 + 我的收藏列表 |
| ✅ 个人主页 | `/u/[code]`：SSR 渲染主页 + 服务端收藏按钮 |
| ✅ 位置页 | `/loc/[code]`：房间号 + 座位号 + 收藏按钮 |
| ✅ 图片系统 | 浏览器压缩 → presigned URL 直传 R2，不经过服务端 |
| ✅ 收藏系统 | 服务端存储，单向静默（A 收藏 B，B 不知道） |
| ✅ 运营后台 | 批量导入、填位置、下架、导出链接、重置密码、QR 码打印、系统设置 |
| ✅ 数据库 | Prisma + Neon PostgreSQL，迁移已完成 |
| ✅ 部署 | Vercel 自动部署，生产 `https://msoweek.site` |

**你现在看到的所有页面都能正常工作**——登录、编辑、上传图片、查看主页、收藏、后台管理等。只是 UI 是灰色石头调的占位风格，等你的设计来替换。

---

## 3. 技术栈（冻结，不要加新的）

| 层 | 选型 | 备注 |
|---|---|---|
| 框架 | Next.js 16 (App Router) + React 19 + TypeScript | Server Components 为主，交互部分用 `"use client"` |
| 样式 | Tailwind CSS v4 | 不是 v3！注意一些 v4 语法差异 |
| 数据库 | PostgreSQL (Neon Serverless) + Prisma v6 | 连接串有两个：`DATABASE_URL`（pooled）和 `DIRECT_URL`（migrate 专用） |
| 图片存储 | Cloudflare R2（S3 兼容） | presigned URL 直传，不走服务端 |
| 密码哈希 | Node 内置 `node:crypto` scrypt | **没有** bcrypt/argon2，别装 |
| 会话 | jose (HS256 JWT) | 两套独立 cookie：`owk_session`（学生 14 天）+ `owk_admin`（运营 8 小时） |
| 验证 | nanoid（短码）、qrcode（二维码）、browser-image-compression |

**原则：不加未列出的库。** 如果要加，先确认是否真的需要。

---

## 4. 项目结构速查

```
wp-a/
├── app/
│   ├── page.tsx                    # 首页 → 学生登录表单 + 管理员入口
│   ├── LoginForm.tsx               # 登录表单（"use client"）
│   ├── layout.tsx                  # 全局 layout（Geist 字体 + globals.css）
│   ├── globals.css                 # 全局样式，目前只有基础 reset
│   │
│   ├── me/                         # 个人中心（需登录）
│   │   ├── page.tsx                # Server Component：校验 session → 渲染编辑表单 + 收藏列表
│   │   ├── MeEditForm.tsx          # 编辑表单（"use client"，426 行）：所有字段 + 头像 + 图片上传
│   │   ├── FavoritesList.tsx       # 我的收藏列表（"use client"）
│   │   ├── ShareButton.tsx         # 一键复制主页链接
│   │   └── LogoutButton.tsx        # 退出登录
│   │
│   ├── u/[code]/                   # 个人主页（需登录，SSR）
│   │   ├── page.tsx                # Server Component：登录闸 + 查数据库 → 渲染主页
│   │   ├── ImageGallery.tsx        # 图片网格（"use client"）
│   │   └── ImageLightbox.tsx       # 全屏图片查看（"use client"）
│   │
│   ├── loc/[code]/                 # 位置页（需登录，SSR）
│   │   ├── page.tsx                # Server Component：房间号 + 座位号（大字）+ 收藏按钮
│   │   └── FavoriteButton.tsx      # 收藏按钮（"use client"，乐观更新 + 回滚）
│   │
│   ├── admin/                      # 运营后台
│   │   ├── page.tsx                # 1216 行大组件：登录 + 6 个 tab（导入/导出/位置/下架/重置密码/QR/设置）
│   │   └── layout.tsx              # admin 专用 layout
│   │
│   └── api/                        # 全部 API 路由
│       ├── auth/login/route.ts     # POST 学生登录 → Set-Cookie
│       ├── auth/logout/route.ts    # POST 清 cookie
│       ├── me/route.ts             # GET/PATCH 本人数据
│       ├── me/images/route.ts      # POST/DELETE 图片记录
│       ├── me/favorites/route.ts   # GET 我的收藏列表
│       ├── upload-url/route.ts     # POST 获取 R2 presigned PUT URL
│       ├── favorites/route.ts      # POST toggle 收藏
│       ├── settings/route.ts       # GET 公开读单个设置
│       └── admin/                  # 11 个 route（login/logout/session/import/export/location/takedown/persons/qr/settings/reset-password）
│
├── components/                     # 共享 UI 组件
│   ├── AvatarUploader.tsx          # 头像上传（压缩 → presigned URL → 直传 R2）
│   └── ImageGrid.tsx               # 多图上传网格（最多 4 张，支持删除）
│
├── lib/                            # 工具库（不动）
│   ├── auth.ts                     # 学生/管理员 session + 密码哈希
│   ├── prisma.ts                   # Prisma 客户端单例（防 serverless 冷启动连接耗尽）
│   ├── r2.ts                       # R2 S3 客户端 + presigned URL 生成
│   ├── code.ts                     # nanoid 短码 + 可打印密码生成
│   ├── csv.ts                      # CSV RFC 4180 转义 helper
│   ├── rate-limit.ts               # 登录限流（内存滑动窗口）
│   └── qr.ts                       # 二维码生成
│
├── prisma/
│   ├── schema.prisma               # 数据模型（Person/Image/LocationCard/Favorite/SystemSetting）
│   └── migrations/                 # 已完成的迁移
│
├── monk/
│   └── index.html                  # Figma 可交互原型（6 屏，← → 翻页）
│
├── docs/
│   ├── 01_PRD_v1.0.md              # 产品需求文档（历史）
│   ├── 02_开发文档_v1.0.md          # v1.0 开发文档（历史参考）
│   ├── 03_操作手册.md               # 运营操作手册
│   ├── 04_开发文档_v2.0.md          # v2.0 账号系统开发文档（当前实现依据）
│   └── 05_admin_界面修复_v1.md      # admin 界面修复记录
│
└── 配置文件
    .env.example                    # 环境变量模板（9 个变量）
    next.config.ts                  # Next.js 配置
    prisma.config.ts                # Prisma v6 配置（注意 provider="prisma-client"）
    tsconfig.json
    package.json
```

---

## 5. 核心设计决策（为什么长这样）

### 5.1 身份体系：两套独立 cookie

- **学生**：`owk_session`（httpOnly JWT，Signed with `SESSION_SECRET`，14 天）
- **管理员**：`owk_admin`（httpOnly JWT，Signed with `ADMIN_PASSWORD`，8 小时）
- 两套互不干扰，共用 `jose` 库但不同的密钥

### 5.2 会话保持：必须服务端 Set-Cookie

这是整个系统**最关键的细节**。活动期 10+ 天，学生只在第一天登一次，之后每次碰 NFC 要自动是登录态。

- Cookie 必须由服务端 `Set-Cookie` header 下发，**不能**用 `document.cookie` 或 localStorage
- 原因：iOS Safari ITP 会把脚本写的 cookie 砍到 ~7 天，但服务端 httpOnly cookie 不受此限制
- 如果做错了，学生会「明明登过却被登出」，碰收藏丢账

### 5.3 收藏：单向、静默、服务端

- A 收藏 B → 只有 A 能看到自己收藏了 B
- B 永远不知道被谁收藏了、被收藏了多少次
- 不存在「谁收藏了我」的任何查询路径——`favoritesReceived` 反向关系只为级联删除
- 收藏按钮用**乐观更新**：先改 UI 状态，后台发 POST，失败则回滚

### 5.4 图片：presigned URL 直传

前端 `browser-image-compression` 压缩 → 请求 `/api/upload-url` 拿 presigned PUT URL → 浏览器直接 PUT 到 R2 → 调 `/api/me/images` 存记录。

**图片不经过服务端**，省带宽、省内存、快。

`/api/upload-url` 返回的 `key` 必须原样传给 `/api/me/images`。不要从 `publicUrl` 反推 key。服务端会校验 key 属于当前学生、URL 与 key 匹配，并在 Serializable transaction 内做最终 4 张图片上限检查；预签名接口的 count 只是前置拦截。`/api/upload-url` 还有用户级内存限流：每人 10 分钟最多 20 次。

### 5.5 短码复用

同一个 `code` 同时服务：
- `/u/{code}` → 个人主页
- `/loc/{code}` → 位置页

所以每人只需一个短码，两张 NFC 标签（一张写 `/u/码`，一张写 `/loc/码`）。

### 5.6 位置页是兜底

即使用户没布置主页，位置页（房间号 + 座位号）依然在。保证每个人在墙上的明信片都能被碰出来，平等曝光。

---

## 6. 关键坑点（踩过才总结的）

### 6.1 不要改 API 和 lib
`lib/` 下的所有文件和 `app/api/` 下的所有路由已经稳定，不要动。如果你需要新接口，先在 docs/ 里写好接口规范再实现。

### 6.2 图片上传链路不要改
AvatarUploader 和 ImageGrid 已经封装好了压缩→presigned URL→直传→存记录的全链路。改 UI 时只改样式，不改逻辑。

### 6.3 登录闸不要去掉
`/u/[code]`、`/loc/[code]`、`/me` 三个页面开头都有 `verifyStudentSession()` 检查，无 session 会 redirect 到 `/?next=当前路径`。这是产品硬需求——不登录不能看。

### 6.4 状态 ≠ 页面空白
两个地方有特殊状态页：
- `person.hidden = true` → 显示「该页面已隐藏」占位
- `person.published = false` → 显示「这位同学还没布置主页」占位

做 UI 时这两个状态也要设计，不能白屏。

### 6.5 学生资料字段服务端校验
`englishName` / `chineseName` 上限 40 个 code point，`grade` 上限 20 个 code point，`bio` 上限 80 个 code point（不是 byte、不是 char）。emoji 占 2 个 code point。`avatarUrl` 只能为空，或来自 `R2_PUBLIC_BASE_URL`。校验在 `/api/me` PATCH 里。

### 6.6 主页自动发布
学生上传头像并保存资料后，`/api/me` PATCH 会自动把 `published` 设为 `true`。学生端没有可见性 toggle；运营仍可用 `hidden` 下架。

### 6.7 密码不可逆 + 复杂度已升级
存库的是 scrypt hash，明文只在**生成那一刻**出现一次（导入或重置密码时）。导出 CSV 不含密码。丢了只能走「重置密码」——联系组长 → 开发在 admin 重置 → 生成新明文。

当前密码为 12 位大小写+数字+安全符号，约 69^12 种组合，配合 scrypt 可抗离线暴力破解。学生登录和 admin 登录都已加 rate limiting。

`ADMIN_PASSWORD` 和 `SESSION_SECRET` 都没有硬编码 fallback；缺失时 auth 相关代码直接报错，避免静默使用弱 JWT 密钥。

### 6.8 editToken 列还在但要继续生成
虽然 `/edit/{token}` 路由已删，但 `editToken` 列是 `NOT NULL @unique` 约束。import 时必须继续调用 `createUniqueEditToken()` 生成它，不然建账号会撞非空约束。**你想彻底清掉这列就单独做一次 migration，不要和 UI 改动混在一起。**

批量导入已事务化。导入接口会先生成账号数据，再在一个 Prisma transaction 中创建 Person 和 LocationCard；任一行失败时整批回滚，不产生半成功名单。

### 6.9 微信内置浏览器的问题
微信和 Safari 是独立的 cookie jar。如果在微信里登了录，碰 NFC 弹出 Safari→看起来没登过。当前代码在 `LoginForm.tsx` 里有微信 UA 检测，会引导用户在默认浏览器打开。**做 UI 时保留这个逻辑。**

### 6.10 Prisma v6 配置
- Generator 用 `provider = "prisma-client"`（不是 `"prisma-client-js"`），并设置 `engineType = "client"`
- `lib/prisma.ts` 使用 `@prisma/adapter-neon` 驱动适配器，从 `DATABASE_URL` 创建连接
- 生成产物在 `app/generated/prisma/`，仍提交 git，但不再包含原生引擎二进制
- `directUrl` 在 `prisma.config.ts`，不在 `schema.prisma`
- 已移除 `binaryTargets`、`outputFileTracingIncludes`、`vercel.json` 的 `functions.includeFiles` 等旧版引擎打包 workaround
- `package.json` 的生产 build 当前仍是 `next build --webpack`（历史遗留），理论上可恢复默认 Turbopack

### 6.11 系统设置
当前 admin「系统设置」tab 暂无运营可配开关。主页可见性由系统自动决定：学生上传头像并保存资料后自动发布；运营通过「下架」tab 控制 `hidden`。

---

## 7. 部署信息

| 项 | 值 |
|---|---|
| 生产地址 | `https://msoweek.site` |
| 部署方式 | Vercel，`main` 分支 push 自动部署 |
| 域名 DNS | Cloudflare |
| 数据库 | Neon PostgreSQL（新加坡 ap-southeast-1） |
| 图片存储 | Cloudflare R2（桶名 `owek-images`） |

### 环境变量（生产必须全设）

```
DATABASE_URL          # Neon pooled 连接串
DIRECT_URL            # Neon direct 连接串
R2_ACCOUNT_ID         # Cloudflare 账号 ID
R2_ACCESS_KEY_ID      # R2 API Key ID
R2_SECRET_ACCESS_KEY  # R2 API Key Secret
R2_BUCKET             # "owek-images"
R2_PUBLIC_BASE_URL    # R2 公开域名
ADMIN_PASSWORD        # 后台口令
SESSION_SECRET        # ≥32 字节随机串（openssl rand -base64 48）
APP_BASE_URL          # "https://msoweek.site"
```

### 本地开发

```bash
cp .env.example .env   # 填好环境变量
npm install
npx prisma generate
npx prisma migrate dev
npm run dev            # http://localhost:3000
```

### 构建验证

```bash
npx tsc --noEmit       # 类型检查
npm run build           # 构建（当前通过）
```

---

## 8. 设计参考：Welcom👀n

### Figma 文件
- 文件 ID：`qHFGyH41gsFG4BQMHft8i0`
- 文件名：`Welcom👀n`
- 包含 6 个 Frame：启动页 → 欢迎首页 → 名片查看 → 名片编辑 → 编辑 v2 → 形容词页

### 可交互原型
`monk/index.html` — 在浏览器打开，用 ← → 翻页，点击橙色按钮触发转场动画。

### 设计 Token（已从 Figma 提取）

```
主色：      #FF530F  (orange-red，所有按钮/圆形)
背景：      #FFFFFF
卡片底色：  #F7F7F7
卡片边框：  #D9D9D9 (20px stroke)
灰色系：    #E6E6E6, #EBEBEB (占位符)
文字深色：  #000000
文字弱色：  #D9D9D9 (副标题), #808080 (标签)
英文数字：  Platform Medium, weight 500
中文字体：  HYQiHei 80S, weight 400
圆角：
  75px  — 卡片外框
  30px  — 按钮 + 头像
  20px  — 小按钮
  12px  — 占位符
```

### 页面流转与动画参数

```
启动页 → 欢迎首页  PUSH↑  2084ms  SLOW
欢迎 → 名片查看    PUSH↑  2084ms  SLOW
名片查看 → 编辑页  fade   300ms   LINEAR
编辑 → 编辑 v2     spring 3798ms  CUSTOM_SPRING (mass:1, stiffness:222, damping:3.7)
编辑 v2 → 形容词   PUSH↑  2084ms  SLOW
```

### 关键设计特征
- **没有用 Auto Layout**——所有元素是手动 FIXED 定位。padding/gap 需要从绝对坐标差值推算
- **名片卡片倾斜** — `rotate(-10deg)`，阴影层 `rotate(3deg)`
- **Figma 视口是 MacBook 14" (1512×982)** — 做移动端适配是新挑战

---

## 9. 你需要做的：UI/UX 实现

详细任务拆解见 **§0 待做清单**，这里补充实现层面的注意事项。

### 你的优势
后端全部就绪，API 接口稳定。你只需要专注于前端：
- 改样式不改接口
- 加动画不改数据流
- 换组件不改业务逻辑

### 前端工作（任务 1 + 2）

1. **Tailwind 配置** — 把设计 token（颜色、字体、圆角）配进 Tailwind theme 或 CSS variables
2. **全局 layout 改造** — 字体引用（HYQiHei 需要 web font 或回退方案）、基础色板
3. **首页 / 页面** — 按 Figma 启动页 + 欢迎首页的设计重新做
4. **个人主页 /u/[code]** — 名片查看页的倾斜卡片布局 + 占位符状态
5. **编辑页 /me** — 名片编辑页的交互 + 编辑 v2 的 spring 动画
6. **位置页 /loc/[code]** — 保持功能，升级视觉（房间号座位号要大、要显眼是核心功能）
7. **移动端适配** — Figma 只有 MacBook 14" 桌面端，需要做响应式。移动端优先——用户全是手机打开
8. **加载动画与页面转场** — PUSH 推入 + spring 弹入 + 按钮微交互（动画参数见 §8.3）。别忘了加这些 loading 态：
   - 图片上传中的进度指示器
   - 收藏 toggle 时的反馈（当前是乐观更新但无视觉变化）
   - 表单提交时的 loading 状态
   - 页面首次加载的骨架屏或过渡

### 后端改动（任务 3：密码复杂度）

这是你能做的唯一一个后端改动，也很小——只改 `lib/code.ts` 一个文件：
- 新增 `PASSWORD_ALPHABET`（大小写 + 数字 + 安全标点）
- `newPlainPassword()` 改用 10+ 位长度
- 保留原 `ALPHABET` 不动（给短码和 edit token 用）
- 具体改法见 §0 任务 3

> 改完后影响：导入和重置密码返回的明文会变长。管理后台导入页面的「下载帐密 CSV」按钮、密码展示区域可能需要在视觉上适应更长的字符串。

### 可选工作（任务 4：收藏夹独立页）

见 §0 任务 4。如果做，新建 `app/collection/page.tsx`，API 现成。

### 不需要你做
- 账号系统、登录、权限
- 数据库、API、图片存储
- 运营后台核心逻辑（admin 页面保持现有功能即可，想美化也行但不急）
- 收藏的业务逻辑（API 端已稳定）

### 资源加载建议
- Platform Medium 和 HYQiHei 80S 是非系统字体。Platform 可用 Inter (Google Fonts) 近似的 500 weight 替代；HYQiHei 可用 PingFang SC / Hiragino Sans GB 回退。如果要精确还原，需要引入 web font。
- 别上太多重依赖。现在前端依赖只有 `browser-image-compression`、`qrcode`、`nanoid`（都不在浏览器渲染路径上），尽量保持轻量。如果要加动画库，Framer Motion 是最常见选择，但它是新依赖——确认需要再加。

---

## 10. 文档索引

| 文档 | 路径 | 适合看什么 |
|------|------|-----------|
| PRD v1.0 | `docs/01_PRD_*.md` | 产品思路、页面逻辑、状态定义 |
| 开发文档 v2.0 | `docs/04_开发文档_v2.0_账号系统迁移.md` | 完整接口契约、认证流程、所有 gotcha |
| 操作手册 | `docs/03_操作手册.md` | 运营怎么用这个后台 |
| Admin 修复记录 | `docs/05_admin_界面修复_v1.md` | admin 页面修过的 bug |
| AGENTS.md | 项目根 | agent 工作规范（如果你也用 AI coding agent） |
| 协作日志 | `.sisyphus/collaboration-log.md` | 每次协作的完整过程记录 |
| Figma 原型 | `monk/index.html` | 可交互原型 |
| README | 项目根 | 系统架构图、技术栈、环境搭建 |

---

## 11. 联系与权限

- **GitHub 仓库**：需要 push 权限的话找仓库 owner
- **Vercel**：找 owner 加你进 team 才能看部署日志
- **Neon / R2**：需要的话找 owner 给你 dashboard 权限
- **Figma**：设计文件在 `qHFGyH41gsFG4BQMHft8i0`，需要 viewer 权限

---

有问题随时问。代码能跑通、逻辑已经验证过，放心大胆改前端。
