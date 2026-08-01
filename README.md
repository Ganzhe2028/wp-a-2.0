# O-Week 数字迎新作品展

这是本次活动即将上线的正式系统。学生通过账号编号和初始密码登录，完成 Day 1 与 Day 3 作品，再浏览其他同学的作品。

## 当前发布口径

| 项目 | 当前结论 |
|---|---|
| 发布分支 | `XuChen` |
| 正式网址 | [https://msoweek.site](https://msoweek.site) |
| `www` | 不作为对外入口；当前不使用 `www` 网址、二维码或宣传链接。 |
| 登录方式 | 账号编号 + 初始密码。 |
| 学校 SSO | 已预留，当前为 P1 工作，不配置也不阻塞本次发布。 |
| Day 1 / Day 3 | 以当前代码中的模板和内容作为本次发布基线；后续调整视为单独变更。 |
| 旧个人主页数据 | 不迁移、不参与本次活动；仅作为数据库备份保留。 |

## 学生流程

`/login` → `/home` → `/me/day-1`、`/me/day-3` → `/browse` → `/artworks/{publicId}`

学生和管理员都使用正式账号体系。管理员在 `/admin` 管理账号、组别、活动设置和作品状态。

旧 `/day1`、`/day3`、`/u/{code}` 仅保留为安全跳转；`/nfc/{code}` 与 `/package/{code}` 不提供特殊访问权限。

## 本地运行

需要 Node.js `22.14.0` 与 npm `10.9.2`。

```bash
cp .env.example .env.local
npm ci
npm run generate
npx prisma migrate deploy
npm run dev
```

本地环境变量以 `.env.example` 为准。发布版本保持：

```env
AUTH_MODE=LOCAL_ONLY
```

OIDC 变量在本次发布保持为空。后续接入学校 SSO 时，以 `HYBRID` 方式补充，不重建账号、不迁移作品。

本地运行时可访问 `/_preview` 查看学生端和 Admin 的展示数据。该入口仅在 `npm run dev` 可用；不会登录、连接数据库、上传图片或保存任何修改，生产环境返回 404。

## 验证

```bash
npm run lint
npm run typecheck
npm test
npm run check:generated
npm run check:openapi
npm run build
npm run audit:harness
```

## 文档

- [当前工程基线与发布口径](docs/08_v1.1_工程基线与契约.md)
- [账号与 SSO 后续方案](docs/11_账号认证与SSO兼容补充规范_v1.0.md)
- [正式领域模型记录](docs/10_v1.1_domain_schema_handoff.md)
- [实施与验收历史记录](docs/12_v1.1_完整开发实施与交接记录.md)

`docs/01` 至 `docs/07`、`docs/09` 以及旧 Person 映射说明都是历史资料，不得用作当前开发或发布依据。
