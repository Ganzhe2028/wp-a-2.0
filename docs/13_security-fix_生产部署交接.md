# Security Fix 生产部署交接（Sophia / Agent）

文档日期：2026-08-06  
目标分支：`XuChen`  
待发布分支：`security-fix`  
安全修复提交：`4591866`  
正式网址：`https://msoweek.site`

---

## A. 给 Sophia 看的部分（约 1 分钟）

### 结论

这次发布不会删除或迁移现有账号、作品记录和 R2 图片，也没有数据库结构变更。普通用户的数据和密码保持不变。

### 你需要处理的事情

1. 确认 GitHub Production Secrets 中的 `DATABASE_URL`、`DIRECT_URL` 仍指向当前正式 Neon 数据库。
2. 在 Vercel Production 中临时设置一个唯一的 `PROTECTED_ADMIN_INITIAL_PASSWORD`，不要把值发到聊天、文档或截图里。
3. 将 `security-fix` 合并到 `XuChen`，等待 Vercel 验证和部署成功。
4. 用 `SophiaXu` 和新密码登录一次；旧密码及旧 Admin 会话会失效，这是预期行为。
5. 登录成功后删除该临时环境变量并重新部署一次，再部署图片 Worker。

### 上线后的可见变化

- 旧的公开图片直链不再可用；用户必须登录并拥有浏览权限。
- 合法用户仍能看到以前上传的图片，但图片不再使用公共长期缓存，首次加载可能略慢。
- 如果任何账号、作品数量异常，或已登录用户普遍看不到图片，立即停止后续操作并按下方回滚说明处理。

---

## B. 给 Sophia 的 Agent / Codex 看的部分

### 1. 任务目标

将 `security-fix` 的安全修复安全发布到 `XuChen`，确保：

- P0：仓库内固定 Admin 密码被撤销，现有 `SophiaXu` 凭据完成一次安全轮换；
- P2：处理完成的图片在每次读取前按当前会话和作品权限重新授权；
- P2：生产 GitHub Actions 固定可执行依赖，并缩小 Secret 暴露范围；
- 现有账号、Submission、Asset、Artwork Public ID 和 R2 对象数量不减少；
- 发布后正式学生流程、Admin 流程和既有图片继续工作。

### 2. 当前事实与唯一依据

- 仓库：`wp-a`
- 正式发布分支：`XuChen`，名称区分大小写。
- 安全修复分支：`security-fix`；交接时目标提交为 `4591866`。
- 正式域名：`https://msoweek.site`，不得改用 `www`。
- 工程基线：`docs/08_v1.1_工程基线与契约.md`。
- 账号补充规范：`docs/11_账号认证与SSO兼容补充规范_v1.0.md`。
- Vercel 工作流：`.github/workflows/deploy-vercel-production.yml`，仅在 `XuChen` push 时自动发布。
- 图片 Worker 不在该 GitHub Actions 中自动发布，必须在 Vercel 应用兼容版本上线后单独发布。
- 本次 diff 不包含 `prisma/schema.prisma` 或 `prisma/migrations/**` 变更，不需要执行 migration。

### 3. 禁止事项

- 不执行 `prisma migrate reset`、`prisma db push`、数据库清空、R2 批量删除或任何 reset/delete 类操作。
- 不打印、复制到聊天或写入文件：数据库连接串、Vercel Token、Cloudflare Token、Cookie、Admin 新密码、`ASSET_PROCESSOR_SECRET`。
- 不修改 Vercel 项目、Neon 数据库、R2 Bucket、Worker 的资源归属。
- 不把 `www.msoweek.site` 重新设为正式入口。
- 不在验证失败时继续发布下一层；先停止并保留证据。
- 不通过测试账号制造正式数据，除非 Sophia 明确授权。

### 4. 发布前只读核对

#### 4.1 仓库

确认工作区干净、提交正确，并审查相对主分支的完整差异：

```bash
git status --short
git branch --show-current
git log -3 --oneline --decorate
git diff --stat XuChen...security-fix
git diff --name-only XuChen...security-fix -- prisma/schema.prisma prisma/migrations
```

预期：最后一条没有输出。若存在数据库结构或 migration 变化，停止发布并重新评审。

在干净 checkout 上重新执行：

```bash
npm run lint
npm run typecheck
npm test
npm run check:generated
npm run check:openapi
npm run build
npm run audit:harness
```

所有命令必须通过。不要用跳过测试的方式合并。

#### 4.2 正式配置

只确认变量存在、环境和目标正确，不读取或回显值：

- GitHub Production：`VERCEL_TOKEN`、`VERCEL_ORG_ID`、`VERCEL_PROJECT_ID`、`DATABASE_URL`、`DIRECT_URL`。
- Vercel Production：`AUTH_MODE=LOCAL_ONLY`、`APP_BASE_URL=https://msoweek.site`、`R2_PUBLIC_BASE_URL=https://msoweek.site/r2-assets`、`ASSET_PROCESSOR_SECRET` 及现有 R2 配置。
- Cloudflare Worker：名称 `oweek-image-processor`，R2 binding 指向 `oweek-images`；`ASSET_PROCESSOR_SECRET` 必须与 Vercel 中的同名 Secret 相同。

如果不能确认 GitHub 的两个数据库 Secret 指向当前正式 Neon 数据库，必须停止。错误连接串虽然不会删除原数据库，但会让上线应用连接到另一数据库，表现为“数据全部消失”。

#### 4.3 发布前数据基线

使用只读查询记录以下数量，不记录姓名、邮箱、密码、Token 或作品内容：

- `User`：总数及 `ACTIVE` / `ARCHIVED` 数量；
- `Submission`：总数及各状态数量；
- `Asset`：总数及 `READY` / `PROCESSING` / `FAILED` 数量；
- R2：对象总数；如平台无法低成本获得精确总数，记录若干现有 `READY` Asset 是否能正常显示。

这些数字用于发布后对比，不允许为“校准数字”而修改正式数据。

### 5. 发布顺序

严格按以下顺序执行。

#### 阶段 1：准备 Admin 一次性密码

由 Sophia 在 Vercel Production 的安全界面中设置 `PROTECTED_ADMIN_INITIAL_PASSWORD`：

- 使用唯一的随机高强度值，长度 16–128 个字符；
- 不与其他系统或环境复用；
- 不通过聊天、命令行参数、截图或仓库文件传递；
- 记录到 Sophia 认可的密码管理器。

设置环境变量后，确认下一次 Production Deployment 会包含该变量。

#### 阶段 2：发布 Vercel 应用

通过正常 PR 审查将 `security-fix` 合并到 `XuChen`。不要强推，不绕过失败的检查。

等待 GitHub Actions 的 verify 和 deploy 两个 job 全部成功。随后确认：

- `https://msoweek.site` 正常打开；
- `/login`、`/home`、`/browse` 和 `/admin` 没有 5xx；
- 对 `/api/internal/assets/authorize` 发送无签名请求返回 401，说明新授权端点已上线且没有公开开放；
- 当前账号、Submission、Asset 数量未下降。

只有新授权端点确认上线后，才允许发布图片 Worker。

#### 阶段 3：完成受保护 Admin 凭据迁移

由 Sophia 使用 `SophiaXu` 和新的 `PROTECTED_ADMIN_INITIAL_PASSWORD` 登录一次。

预期结果：

- 新密码登录成功；
- 历史固定密码失效；
- 旧的 `SophiaXu` 会话被撤销；
- Admin Audit 中出现 `PROTECTED_ADMIN_CREDENTIAL_V1_PROVISIONED`；
- 普通用户密码和会话不受影响。

不要反复尝试旧密码，避免触发登录限流。

成功后，从 Vercel Production 删除 `PROTECTED_ADMIN_INITIAL_PASSWORD`，并再次发布当前 `XuChen`。环境变量删除只有进入新的 Production Deployment 后才算真正从运行版本移除。第二次发布后，再确认 `SophiaXu` 新密码仍能登录。

#### 阶段 4：发布图片 Worker

确认 Vercel 当前版本包含 `/api/internal/assets/authorize`，然后按照 `workers/image-processor/README.md` 发布 `oweek-image-processor`。

发布前确认：

- `workers/image-processor/wrangler.jsonc` 中 `APP_BASE_URL` 和 `PUBLIC_ORIGIN` 都是 `https://msoweek.site`；
- R2 binding 仍指向 `oweek-images`；
- Worker 与 Vercel 的 `ASSET_PROCESSOR_SECRET` 一致；
- 不修改或清空 R2 Bucket。

Worker 更新只改变读取授权和缓存策略；不会遍历、搬迁或删除既有 `processed/`、`_derived/processed/` 对象。原有上传处理逻辑仍只在新图片成功生成处理结果后删除对应的 `incoming/` 原图。

### 6. 发布后验收

#### 必须通过

- 未登录访问已有图片 URL：返回 404，R2 文件本身仍存在。
- 已登录的作品所有者：能够看到自己以前上传的图片。
- 已提交 Day 1 且有权限的 Learner：能够看到 Gallery 中允许查看的已有图片。
- Senior：只能看到现有 Group 规则允许的图片；跨组直接 URL 返回 404。
- Admin：能够查看允许的作品，并可对 `SophiaXu` 执行单个密码重置；重置后旧会话失效。
- 图片响应包含 `Cache-Control: private, no-store`。
- Worker 健康检查正常；图片授权服务不可用时返回失败，不得退化为公开读取。
- 发布前后的 User、Submission、Asset 数量一致；除 Admin 凭据轮换审计和必要会话变化外，不应出现批量数据写入。

#### 可选且需要 Sophia 明确授权

使用专门测试账号完成一次新图片上传，验证“压缩—直传 R2—Worker 处理—回调 READY—授权读取”全链路。不要使用正式参与者账号，也不要擅自创建、归档或删除测试数据。

### 7. 停止条件

出现以下任一情况立即停止，不继续发布下一阶段：

- GitHub/Vercel 的数据库连接目标无法确认；
- 仓库出现未解释的 migration、schema 或批量删除变化；
- CI、typecheck、test、build 任一失败；
- Vercel 新版本的媒体授权端点不是预期的 401/签名授权行为；
- `SophiaXu` 新密码无法登录，或普通用户登录受到影响；
- 数据基线数量下降；
- Worker 发布后合法用户普遍无法加载图片；
- 出现 Secret、Cookie 或个人数据泄露迹象。

### 8. 回滚原则

- Vercel 阶段失败且 Worker 尚未更新：回滚到上一个 Vercel Production Deployment。数据库和 R2 不做任何回滚或删除。
- Worker 已更新后发生图片故障：优先把 Worker 回滚到上一可用版本，再处理 Vercel。新 Worker 依赖新应用的授权端点，不能在旧应用上单独运行。
- Admin 密码已经轮换后，不恢复历史固定密码；即使应用回滚，也继续使用新密码或后台单个密码重置。
- 本次没有 migration，因此禁止用数据库恢复、重建或 schema reset 解决应用发布问题。
- 回滚后重新核对 User、Submission、Asset 数量和 R2 对象可用性。

### 9. 交付记录

完成后向 Sophia 留下以下不含 Secret 的记录：

- 合并 commit SHA 与 `XuChen` 最终 commit SHA；
- 两次 Vercel Production Deployment ID：含一次性变量的迁移版本、移除变量后的最终版本；
- Worker Deployment/Version ID；
- CI 与构建结果；
- 发布前后 User、Submission、Asset 数量对比；
- 人工验收结果和任何回滚记录；
- 确认 `PROTECTED_ADMIN_INITIAL_PASSWORD` 已从最终 Production Deployment 移除。

### 10. 完成定义

只有以下条件全部满足，任务才可标记完成：

1. `XuChen` 当前版本包含安全修复；
2. 所有自动验证通过；
3. Admin 安全迁移完成且一次性变量已从最终运行版本移除；
4. Worker 已发布并执行逐请求媒体授权；
5. 合法用户可查看既有图片，未授权直链返回 404；
6. 账号、Submission、Asset 和 R2 数据未减少；
7. 交付记录完整且不含任何 Secret 或个人数据。
