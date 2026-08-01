# k2.7-code Harness 精简框架

> **历史流程记录。** 当前发布与验证规则以 `AGENTS.md` 和 `docs/08_v1.1_工程基线与契约.md` 为准。

本文定义当前 OWeek repo 内的最小 agentic coding harness。目标不是替代工程判断，而是把 review、修复、验证、沉淀变成可执行闭环。

## 最小闭环

固定流程为：

1. `Review`：只读审查代码和文档，产出 finding。
2. `Fix`：只修 `open` finding，不顺手扩大范围。
3. `Verify`：独立逐项验证，不相信 fixer 的总结。
4. `Learn`：把踩坑沉淀到台账、文档或守门脚本。

`npm run build` 只证明项目能构建，不证明 finding 已关闭。每个 P0/P1 finding 都必须有代码位置、命令结果或线上结果证明关闭。

## 角色分工

| 角色 | 权限 | 输出 |
|---|---|---|
| `reviewer` | 只读 | 新增或更新 `docs/review-findings.json` |
| `fixer` | 可修改 | 修复指定 `open` finding，更新相关 docs |
| `verifier` | 优先只读 | 对照台账逐项核验修复是否真实关闭 |

`verifier` 必须回到代码和命令结果验证，不以 session summary 或 commit message 作为证据。

## Finding 台账规则

台账文件为 `docs/review-findings.json`。每条 finding 必须包含：

- `id`：稳定编号，例如 `OWK-001`。
- `title`：一句话描述。
- `severity`：`P0`、`P1`、`P2`、`P3`。
- `status`：只能是 `open`、`fixed`、`deferred`、`false_positive`。
- `source`：来源模型、报告或人工审查。
- `evidence`：代码或文档位置。
- `expectedFix`：关闭标准。
- `verification`：关闭或延期证据。

P0/P1 的 `open` finding 会让 `npm run audit:harness` 失败。`deferred` 必须写清楚延期原因。

## 交付要求

每次 k2.7-code 交付必须说明：

- 修复了哪些 finding。
- 哪些 finding 被延期，以及原因。
- 跑过哪些验证命令。
- 是否同步更新 README、docs 或 AGENTS。

交付前必须运行：

```bash
npm run verify:local
```

如果 `audit:harness` 失败，不能把任务描述为完成；只能明确说明仍有阻断项。

## 本地守门

`scripts/harness-audit.mjs` 会检查已经踩过或已识别的高风险问题：

- build script 必须包含 `prisma generate`。
- README/docs 不能继续推荐设置 `PRISMA_QUERY_ENGINE_LIBRARY`。
- 源码不能使用 `change-me-in-production` 作为 JWT fallback。
- 图片保存不能从 `publicUrl.split("/").pop()` 推导 R2 key。
- `/api/me` 不能返回未筛选的 `Person` 敏感字段。
- `next` 回跳不能使用会放过外部 URL 的校验方式。
- P0/P1 `open` finding 会阻断交付。
- P2 finding 不阻断默认交付，但本项目当前台账应保持无 `open` P2；若重新延期必须写明原因。
- 修改核心代码但未同步 docs 时输出 warning。

脚本输出分为：

- `PASS`：通过。
- `WARN`：需要人工确认。
- `FAIL`：阻断交付。
