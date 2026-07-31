# OWeek 个人主页系统 · 开发文档 v1.0

面向:主开发同学、coding agent

---

## 0. 给 coding agent 的总则

- 技术栈、版本、目录、接口、验收标准都写死在下面。按第 12 节的顺序逐步实现,每完成一步跑该步的验收。
- 不要引入未列出的框架或库。
- 不要把图片或数据库落在本地磁盘。部署在 Vercel serverless,本地磁盘不持久,函数跑完即清空。
- 所有写操作都要服务端校验:图片数量、字数、文件类型、token 有效性。
- 不实现第 13 节列出的任何排除项。

## 1. 技术栈(锁定)

- Next.js(App Router,15 或更新)+ React + TypeScript
- Prisma + PostgreSQL(Neon serverless,用 pooled 连接串查询、direct 连接串迁移)
- 图片存储:Cloudflare R2(S3 兼容),presigned URL 直传,不经过服务端
- 浏览器端图片压缩:browser-image-compression
- 短码:nanoid;二维码:qrcode
- 部署:Vercel;域名与 DNS/CDN:Cloudflare;域名先用自购 .top
- 样式:Tailwind 或团队偏好,手机端优先

## 2. 环境变量

```
DATABASE_URL=        # Neon pooled 连接串(查询用)
DIRECT_URL=          # Neon direct 连接串(prisma migrate 用)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=  # R2 公开访问域名(自定义域或 r2.dev 链接)
ADMIN_PASSWORD=      # 运营后台口令
APP_BASE_URL=        # 如 https://xxx.top,导出链接表时拼前缀用
```

## 3. 目录结构

```
app/
  u/[code]/page.tsx          # 公开主页, server component
  loc/[code]/page.tsx        # 位置页, server component
  edit/[token]/page.tsx      # 编辑页, client
  me/collection/page.tsx     # 本地收藏, client
  admin/page.tsx             # 运营后台, client(口令后)
  api/
    me/route.ts              # GET / PATCH 自己的数据(凭 token)
    me/images/route.ts       # POST 保存图片记录 / DELETE
    upload-url/route.ts      # 取 R2 presigned PUT URL
    admin/login/route.ts
    admin/import/route.ts
    admin/location/route.ts
    admin/takedown/route.ts
    admin/export/route.ts
    admin/settings/route.ts  # GET/PATCH 系统设置(仅管理员)
    settings/route.ts        # GET 公开读单个设置(编辑页用)
lib/
  prisma.ts                  # Prisma client 单例(避免 serverless 连接爆)
  r2.ts                      # R2 S3 client + presign
  auth.ts                    # token 校验 / admin session
  code.ts                    # nanoid 生成 + 查重
components/
prisma/schema.prisma
```

## 4. 数据模型(prisma/schema.prisma)

```prisma
generator client {
  provider   = "prisma-client"
  output     = "../app/generated/prisma"
  engineType = "client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Person {
  id          String        @id @default(cuid())
  code        String        @unique         // 短码, /u/code 与 /loc/code 共用
  editToken   String        @unique
  englishName String?
  chineseName String?
  grade       String?
  bio         String?                        // <= 80 字, 服务端再校验
  avatarUrl   String?
  published   Boolean       @default(false)
  hidden      Boolean       @default(false)  // 下架开关
  images      Image[]
  location    LocationCard?
  updatedAt   DateTime      @updatedAt
  createdAt   DateTime      @default(now())
}

model Image {
  id        String   @id @default(cuid())
  personId  String
  person    Person   @relation(fields: [personId], references: [id], onDelete: Cascade)
  url       String                           // R2 公开 URL
  key       String                           // R2 对象键(删除时用)
  sort      Int      @default(0)
  hidden    Boolean  @default(false)
  createdAt DateTime @default(now())
}

model LocationCard {
  id        String   @id @default(cuid())
  code      String   @unique                 // 与 Person.code 同值
  personId  String   @unique
  person    Person   @relation(fields: [personId], references: [id], onDelete: Cascade)
  name      String                           // 运营填的展示名
  grade     String?
  room      String                           // 房间号
  seat      String                           // 座位码
  updatedAt DateTime @updatedAt
}

model SystemSetting {
  key   String @id          // 设置键名
  value String              // 设置值(字符串形式存储)
}
```

## 5. 身份与权限

- 编辑:URL 里的 editToken。每个编辑接口先按 token 查 Person,查不到返回 403。
- 运营后台:POST /api/admin/login 比对 ADMIN_PASSWORD,通过下发签名的 httpOnly cookie;后台接口校验该 cookie。
- 浏览者:无身份。收藏全在前端 localStorage。

## 6. 短码与 token(lib/code.ts)

- code:nanoid 自定义字母表,去掉易混字符(0 O l 1 I),长度 6。建库时查重,撞了重生成。
- editToken:nanoid 长度 24。
- 同一个 Person 的 code 既走 /u/code 也走 /loc/code。

## 7. 图片上传(presigned 直传 R2)

展示图片流程:
1. 前端选图,用 browser-image-compression 压到长边 ≤ 1600px、约 ≤ 500KB,转 webp。
2. 前端 POST /api/upload-url(带 token),服务端校验 token 且当前图片数 < 4,返回 R2 presigned PUT URL、最终公开 URL、对象 key。
3. 前端把压好的文件 PUT 到该 URL,直传 R2,不过服务端。
4. 前端 POST /api/me/images 保存 {url, key} 到 Image 表。

头像走同一套 upload-url,存到 Person.avatarUrl,不计入那 4 张。

删除:DELETE /api/me/images?id= 先删 R2 对象再删表记录。

上限:单人展示图片最多 4 张,服务端在第 2 步和第 4 步都校验。

## 8. 接口契约

```
GET /api/me?token=...
  → 200 { person, images } | 403

PATCH /api/me?token=...
  body { englishName?, chineseName?, grade?, bio?, avatarUrl?, published? }
  校验:bio 按 code point 计 ≤ 80;published 置 true 时 avatarUrl 必须有值
  注意:仅当 published === true 时才检查 allowStudentPublishControl 系统设置,
        管理员未开启时返回 403;published === false 或未传时不触发此检查
  → 200 { ok } | 400 | 403

POST /api/upload-url?token=...
  body { contentType }
  校验:token;图片数 < 4
  → 200 { putUrl, publicUrl, key } | 403 | 409

POST /api/me/images?token=...
  body { url, key }
  → 200 { image } | 403 | 409

DELETE /api/me/images?token=...&id=...
  → 200 { ok } | 403

POST /api/admin/login
  body { password } → set-cookie | 401

POST /api/admin/import  (cookie)
  body { rows: [{ englishName?, chineseName, grade? }] }
  动作:每行建 Person(生成 code、editToken)+ LocationCard(同 code,name 先取中文名)
  → 200 { created: [{ chineseName, code, editToken }] }

POST /api/admin/location  (cookie)
  body { code, name, grade?, room, seat } → upsert LocationCard → 200

POST /api/admin/takedown  (cookie)
  body { type: "person" | "image", id, hidden } → 置 hidden → 200

GET /api/admin/export  (cookie)
  → 200 表格,每行:name, /u/code, /loc/code, /edit/token(用 APP_BASE_URL 拼全)

GET /api/admin/settings  (cookie)
   → 200 { [key]: value, ... }
   缺失的键自动补默认值:
     allowStudentPublishControl → "true"  (默认允许学生自主发布)
     hideStudentPublishToggle  → "false"  (默认显示发布开关)

PATCH /api/admin/settings  (cookie)
  body { key, value }
  → 200 { ok } | 400 | 401

GET /api/settings?key=...
   公开接口,读取单个系统设置值
   编辑页读取 allowStudentPublishControl 和 hideStudentPublishToggle 两项,
   当任何一项值为 "true" 时隐藏 Published 开关
   → 200 { value: "true" | "false" | null }

GET /api/admin/qr/print  (cookie)
  查所有 Person 记录,为每人并行生成两张 SVG QR 码(/u/码 + /loc/码),
  返回可打印 HTML 页面(4 列 A4 网格,自动弹出打印对话框)
  → 200 text/html | 401
```

## 9. 页面渲染要点

- /u/[code]:server component 直接查库渲染。hidden 或未 published 显示占位页,不白屏。图片 1:1 缩略,点开全屏用客户端灯箱组件,可滑动。
- /loc/[code]:server component。房间号座位码做大做显眼。带客户端收藏按钮。默认不放主页链接(见 PRD 第 11 节,翻起来就是加一个跳 /u/code 的按钮)。
- /edit/[token]:client。表单 + 图片上传组件 + 发布开关(受 allowStudentPublishControl 和 hideStudentPublishToggle 两项系统设置控制)。保存即时校验 bio 字数、发布前校验头像。
- /me/collection:client。读 localStorage 渲染列表,链到 /loc/code。
- /admin:client。登录后七块:导入、位置编辑、下架、QR 码打印、导出、系统设置、重置密码。已做移动端适配(tab 水平滚动+渐隐遮罩、卡片堆叠布局、表格 min-w 横向滚动)。

## 10. 收藏(纯前端)

- localStorage key:owk_collection,值 [{ code, name, savedAt }]。
- 位置页和主页的收藏按钮读写这个 key,按钮反映已收藏状态。
- 收藏页读取并渲染。无后端,无身份。

## 11. 部署步骤(按序)

1. ✅ GitHub 建仓,Next 脚手架推上去。
2. ✅ Neon 建库,拿 pooled 和 direct 两个连接串。
3. ✅ 配 .env,prisma migrate 建表。
4. ✅ Cloudflare R2 建桶,开公开访问(自定义域或 r2.dev),拿 access key,配 CORS 允许 PUT。
5. ✅ Vercel 连仓,填全部环境变量,部署。生产: `https://msoweek.site`（注：v2.0 后域名已迁移至此）
6. .top 域名解析走 Cloudflare,指向 Vercel,HTTPS 自动。
7. 校园网 + 手机真机实测 /u 和 /loc 打开速度。慢或不稳就启用学校域名服务器方案。
8. 运营导入名单,出链接表,写 300 张标签 + 印二维码,逐张验证。

## 12. 构建顺序与验收(coding agent 按此推进)

1. ✅ 脚手架 + Prisma + Neon 连通。
2. ✅ 数据模型 + admin 导入 + 导出。
3. ✅ /u/[code] 主页渲染。
4. ✅ /edit/[token] 文字编辑。
5. ✅ 图片全链路。
6. ✅ /loc/[code] + admin 位置编辑。
7. ✅ 收藏 + /me/collection。
8. ✅ admin 登录保护 + 下架开关。
9. ✅ 二维码批量生成（`/api/admin/qr/print` + admin QR 码 tab）。
10. 🔧 部署 + 真机端到端（Vercel 已部署,待 .top 域名 + 校园网真机实测）。

## 13. 不做(v1.0 明确排除)

服务端账号密码、找回密码、评论、点赞、社交链接聚合、消息通知、配对算法、服务端收藏。这些都不在本期,不要顺手实现。

> **v2.0 已实现**: 账号系统（用户名+密码登录）、服务端收藏（单向静默）、重置密码（admin 人工）。详见 `docs/04_开发文档_v2.0_账号系统迁移.md`。
