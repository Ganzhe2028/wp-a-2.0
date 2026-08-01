# AGENTS.md — O-Week 发布基线

## 唯一当前依据

开发和发布以 `docs/08_v1.1_工程基线与契约.md` 为准；账号与未来 SSO 方案以 `docs/11_账号认证与SSO兼容补充规范_v1.0.md` 为补充。

旧 `docs/01` 至 `docs/07`、`docs/09`、旧 Person 映射说明和历史 review 报告只供回溯，不能覆盖当前规则。

## 当前发布状态

- 发布分支：`XuChen`。
- 正式网址：`https://msoweek.site`；不使用 `www`。
- 学生登录：账号编号 + 初始密码，发布环境固定 `AUTH_MODE=LOCAL_ONLY`。
- 学校 SSO / OIDC：P1 后续工作。代码可预留，但本次不配置、不验收、不阻塞发布。
- Day 1 / Day 3：当前代码中的模板、文案和必填规则就是本次发布基线；后续修改必须作为单独变更。
- 学生流程：`/login` → `/home` → `/me/day-1`、`/me/day-3` → `/browse` → `/artworks/{publicId}`。
- Admin：`/admin`、`/admin/accounts`、`/admin/audit`。
- 旧 `Person`、`Image`、`Favorite`、`LocationCard` 与旧 `SystemSetting` 数据只保留备份；不迁移、不读取、不写入正式运行链路。
- 旧 `/day1`、`/day3`、`/u/[code]` 只保留安全跳转；`/nfc/[code]` 与 `/package/[code]` 必须 fail closed。

## 技术边界

- Next.js App Router、React、TypeScript、Prisma + Neon、Cloudflare R2、Tailwind、browser-image-compression、nanoid、jose；不得增加未列出的框架或库。
- 正式身份使用 `User`、`LocalCredential`、`OidcIdentity`、`Session`。作品和图片使用 `Submission`、`Asset`、`Day1Slot`、`Day3Bottle` 与 `ArtworkPublicId`。
- `DATABASE_URL` 只用于应用查询；`DIRECT_URL` 只用于 Prisma migration。
- 图片必须浏览器直传 R2，正式页面仅使用处理完成的 `Asset`。
- 密码使用 Node `crypto.scrypt`；明文不得写入数据库、日志、审计或长期文件。
- 生产发布前不更改 Vercel、域名或 SSO 配置，除非任务明确要求。

## 文件与数据安全

- 写文件前必须先读；已有文件使用 `apply_patch` 更新，不以删除后重建方式覆盖未知内容。
- 禁止批量删除；删除时只处理已明确确认的单个文件。
- 不执行 `git reset --hard`、`git checkout --`、递归删除或任何会覆盖用户未提交工作的操作。
- 遇到脏工作区，保留并绕开无关改动；不能安全绕开时再报告。
- 旧数据库表是备份，不创建删除它们的 migration。

## 开发与验证

1. 先读相关代码、调用方和当前契约，再编辑。
2. 正式 API 使用 `/api/v1` 与统一 `{ data, requestId }` / `{ error, requestId }` 响应。
3. 每次开发同步更新相关文档；没有相关文档时不自动新增。
4. 完成前至少执行与改动相称的 lint、typecheck、test 和 build；检查 diff 不含无关变更。
5. 只有确认完成或确实需要外部决策时才交付。
