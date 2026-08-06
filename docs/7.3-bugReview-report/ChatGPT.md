> **历史评审快照，不代表当前代码或风险状态。** 当前安全边界见 `docs/08_v1.1_工程基线与契约.md`；2026-08-06 安全修复及发布要求见 `docs/13_security-fix_生产部署交接.md`。

结论：这个项目的安全性已经不是“新手裸写级别”，但还没到“活动当天可安心扛住混乱”的程度。按 OWeek 校园活动系统来评估，当前最大风险不是企业级高并发，而是：上传链路不稳、后台口令和导出数据管理、R2 被滥用/残留垃圾文件、活动当天依赖 Vercel/Neon/R2 全部在线。

我的判断：安全性 B-，可靠性 C+ 到 B-。修完下面几个 P1/P2，能到“校园活动可上线但要有人值守”的水平。

## 1. 项目定位和真实风险模型

这是一个 OWeek 新生个人主页系统：学生登录后编辑主页，线下通过 NFC/二维码进入位置页或主页，核心使用场景是校园活动期间的几百人规模互动。README 明确写了“墙上明信片→位置页，展位展板→主页”，以及学生账号密码登录、活动期内保持登录。

技术栈是 Next.js + PostgreSQL/Neon + Prisma + Cloudflare R2 + Vercel，图片通过 presigned URL（预签名上传链接）直传 R2，session 用 JWT cookie。 所以真实威胁不是“黑客组织打你”，而是：

| 风险                        | 现实程度 | 影响                             |
| --------------------------- | -------- | -------------------------------- |
| 学生乱试账号密码            | 高       | 看到/改别人主页                  |
| 管理后台口令泄露            | 中       | 全量学生数据、重置密码、下架页面 |
| 上传失败但页面保存了坏图    | 高       | 活动当天大量页面显示异常         |
| 学生上传超大/伪装图片占 R2  | 中       | 费用/存储污染                    |
| Neon/R2/Vercel 某个服务挂了 | 低到中   | 页面无法打开或图片坏             |
| 企业级 DDoS/多地灾备        | 低       | 不值得为此上重架构               |

## 2. 做得比较对的地方

第一，密码不是明文存库。代码用 `scrypt` 生成 salt + hash，并用 `timingSafeEqual` 做密码验证；这对校园活动级别是够用的。

第二，session cookie 设置比较正常：学生和管理员 cookie 都是 `httpOnly`，生产环境下 `secure`，`sameSite: "lax"`。这能挡住一大类前端脚本直接偷 cookie 的问题。

第三，关键环境变量没有默认兜底密钥。`ADMIN_PASSWORD` 和 `SESSION_SECRET` 缺失会直接 throw，而不是用 `change-me-in-production` 之类的默认值。这个点很重要。

第四，主页和位置页不是完全公开浏览，都会先校验学生 session，未登录会跳回登录页。对校园内“只给参与者看”的需求，这是合理设计。

第五，上传图片的 key 是服务端生成，并且保存图片记录时检查 `key` 是否属于当前用户、URL 是否等于服务端根据 key 生成的 public URL。这能防止学生把别人的 R2 key 塞进自己的图片记录。

第六，批量导入已经是事务化的。创建 Person 和 LocationCard 放在同一个 Prisma transaction 里，失败不会半成功半失败。

第七，`.env*` 被 gitignore 排除，只允许 `.env.example` 入库，基础 secret 防泄漏意识是对的。

## 3. 必修问题：优先修这些

| 优先级 | 问题                                      | 为什么重要                                               | 修法                                                         |
| ------ | ----------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| P1     | 上传到 R2 后没有检查 PUT 是否成功         | 会保存坏图 URL，活动当天页面看起来“上传成功但图片打不开” | `const putRes = await fetch(...); if (!putRes.ok) throw ...` |
| P1     | 头像上传会被“最多 4 张图片”限制误伤       | 学生已有 4 张展示图后可能不能换头像                      | `/api/upload-url` 增加 `purpose: "avatar"                    |
| P1     | 预签名上传没有服务端文件大小/真实类型约束 | 登录学生可以 curl 上传大文件或伪装文件，占 R2            | 至少加客户端 size 检查 + R2 生命周期清理；更好是上传后 HEAD 校验 |
| P2     | 后台部分接口缺少严格类型/长度校验         | 管理员误操作或异常请求会写脏数据/500                     | 用轻量 schema 校验，限制 rows、字段长度、bool 类型           |
| P2     | 登录限流是内存 Map                        | Vercel 多实例/冷启动下不可靠                             | 当前可接受；但要靠强密码。若上线范围扩大，再上 Redis/Upstash |
| P2     | 管理员是单共享口令                        | 口令泄露就是全后台沦陷                                   | 用强随机口令；至少单独 `ADMIN_SESSION_SECRET`，不要用口令当 JWT secret |
| P3     | 缺少安全响应头                            | 不是核心漏洞，但低成本                                   | 加 CSP、X-Frame-Options、Referrer-Policy                     |

### P1：上传 PUT 不检查成功

`ImageGrid` 上传时执行了 `fetch(putUrl, { method: "PUT" ... })`，但没有检查 `putRes.ok`，随后直接调用 `/api/me/images` 保存图片记录。 头像上传也一样，PUT 之后直接 `onAvatarChange(publicUrl)`，没有确认 R2 是否真的收到了文件。

这比“黑客攻击”更现实：活动当天网络不稳、R2 短暂失败、手机浏览器中断，都可能导致数据库里保存了一个实际不存在的图片 URL。

建议改成：

```ts
const putRes = await fetch(putUrl, {
  method: "PUT",
  body: compressed,
  headers: { "Content-Type": `image/${ext}` },
});

if (!putRes.ok) {
  throw new Error(`Upload failed (${putRes.status})`);
}
```

### P1：头像上传被 gallery 图片数量限制误伤

`/api/upload-url` 会数当前用户的 `Image` 记录，如果已经有 4 张，就拒绝发 presigned URL。 但头像上传也复用了这个接口，头像并不存到 `Image` 表，而是存在 `avatarUrl` 字段。

结果：一个学生如果已经上传了 4 张展示图，理论上可能无法换头像。这个是典型“功能耦合导致的可靠性 bug”。

修法：`/api/upload-url` 接收 `purpose`。

```ts
// body: { contentType, purpose: "avatar" | "gallery" }

if (purpose === "gallery") {
  // 才检查 Image count >= 4
}

const key = `${session.personId}/${purpose}/${nanoid()}.${ext}`;
```

### P1：R2 上传缺少硬限制

现在服务端只检查 `contentType` 是否是 jpeg/png/webp，然后生成 5 分钟有效的 PUT URL。 R2 端并不会因为你写了 `ContentType` 就自动验证文件真实内容，也没有看到服务端对文件大小做硬限制。客户端确实会压缩到 0.5MB，但客户端限制不能当安全边界。

对这个项目，不需要上完整杀毒/内容审核。低成本做法是：

1. 前端先拒绝原文件超过 8MB 或 10MB。
2. 服务端 presign 时增加 `purpose` 和更严格 key 路径。
3. 上传保存后，服务端用 HEAD 检查对象是否存在、content-type 是否符合、content-length 是否在预期范围内。
4. R2 开 lifecycle rule（生命周期规则），自动清理未被数据库引用的临时目录对象，或定期手动清理。

## 4. 后台安全：够用，但运营风险很集中

后台目前是单口令登录，成功后发 admin JWT。`createAdminSession` 直接比较传入 password 和 `ADMIN_PASSWORD`，然后用 `ADMIN_PASSWORD` 作为 JWT 签名 secret。

这对一个短期校园活动不是不能接受，但前提是 `ADMIN_PASSWORD` 必须是随机长口令，而不是“oweek2026”这种人能记住的口令。因为后台能导入名单、导出链接、重置学生密码、下架主页，权限很大。README 也列出了这些后台接口。

更稳的低成本改法：

```env
ADMIN_PASSWORD=<给运营输入的长口令>
ADMIN_SESSION_SECRET=<openssl rand -base64 48>
```

然后 admin JWT 用 `ADMIN_SESSION_SECRET` 签，不要用管理员口令本身签。

另外，导入和重置密码会把明文密码返回给前端。导入接口返回 `username/password`，后台页面还支持下载 accounts.csv。 这本身合理，因为密码只在生成/重置时出现一次；但运营流程上必须把 `accounts.csv` 当敏感文件处理，活动结束后销毁或至少不要发到大群。

## 5. API 校验：学生端不错，后台端偏松

学生端 `/api/me` 对文本字段做了类型和长度校验：名字 40、年级 20、bio 80，并且头像 URL 必须是 R2 public URL。 这部分比较好。

后台接口偏松。例如位置编辑接口直接从 JSON 取 `code, name, grade, room, seat`，只检查是否存在，然后直接 upsert；没有类型、长度、格式限制。 系统设置接口也允许任意 `key/value` upsert，没有白名单。

这不是高危攻击面，因为后台要先登录。但它很容易导致运营误操作、脏数据、500 错误。建议加非常轻量的校验，不必复杂：

```ts
room: string, 1-20 chars
seat: string, 1-20 chars
name: string, 1-40 chars
grade: string | null, <=20 chars
hidden: boolean
settings.key: only allow ["publishSelfControl", ...]
```

批量导入也建议加最大行数，比如 800 或 1000。现在只检查 `rows` 是非空数组。 对 MSA 约几百人活动足够。

## 6. 登录与限流：方向对，但不要误判它很强

学生登录有 IP 级 20 次/15 分钟、username 级 5 次/15 分钟限制。 后台登录也有 IP 级 10 次/15 分钟限制。

但限流实现是一个进程内 `Map`。 在 Vercel 这种 serverless 环境里，实例重启、多实例、冷启动都会让它不稳定。按这个项目规模，可以不急着上 Redis；但你不能把它当强防护。真正的防护应该是：

1. 学生密码随机 12 位，这个已经做了。
2. 管理员口令必须随机长。
3. 活动期间有人看异常反馈。
4. 如果出现大量撞库，再考虑 Upstash Redis 这种轻量持久限流。

## 7. 可靠性：不需要企业冗余，但需要活动级预案

这个系统的关键路径是 Vercel 跑 Next.js，Neon 存数据，R2 存图片。README 的架构图也明确是 Vercel → Neon/R2。

不建议你为这个项目上多区域数据库、消息队列、复杂容灾。过度设计。更合理的是“活动级预案”：

| 场景                   | 低成本预案                                           |
| ---------------------- | ---------------------------------------------------- |
| 登录炸了               | 提前让学生至少登录一次，14 天 session 足够覆盖 OWeek |
| 数据库短暂不可用       | 活动前导出账号、主页链接、位置表 CSV                 |
| QR 打印出错            | 提前打印一版 QR；不要活动当天现生成                  |
| R2 图片挂了            | 页面仍应显示名字/位置，不要让图片失败影响主流程      |
| 微信浏览器 cookie 问题 | 现在已有微信 UA 提示，这是对的                       |

学生 session 是 14 天，适合 OWeek 这种短期活动。 登录页也有微信内置浏览器提示，能减少“扫了但没登录态”的实际故障。

## 8. 最小修复清单

上线前至少做这 8 件：

1. 检查 R2 PUT response，不成功就不要保存 URL。
2. `/api/upload-url` 加 `purpose`，头像和 gallery 分开限额。
3. 上传后服务端确认对象存在；至少对 gallery 图片做 HEAD 校验。
4. R2 设置生命周期清理，避免失败上传/未保存对象长期残留。
5. 管理员密码改成强随机；最好加 `ADMIN_SESSION_SECRET`。
6. 后台 location/settings/takedown/reset-password 全部加类型和长度校验。
7. 导入 rows 加最大数量，比如 1000。
8. 活动前跑一遍 `npm run verify:local`，因为项目已经有 lint、tsc、build、audit harness 组合脚本。

一句话判断：这项目现在的“方向”是对的，已经有安全意识；真正需要补的不是企业级架构，而是上传链路、后台输入校验、运营口令/密码文件管理、活动当天应急预案。
