> **历史评审快照，不代表当前代码或风险状态。** 当前安全边界见 `docs/08_v1.1_工程基线与契约.md`；2026-08-06 安全修复及发布要求见 `docs/13_security-fix_生产部署交接.md`。

**审查结论**

未发现 P0/Critical。按这个项目的定位，当前架构取舍基本合理：150 人左右、短期 OWeek 活动、Vercel + R2 + Neon，不需要企业级冗余。主要问题集中在上传边界和输入健壮性。

| 级别 | 问题                                                        | 位置                                                         | 影响                                                         | 建议                                                         |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| P1   | 头像 URL 只校验 R2 域名，不校验是否属于当前学生             | [app/api/me/route.ts (line 31)](/Users/mac/Desktop/baolecheng/MSA/26WP/wp-a/app/api/me/route.ts:31), [AvatarUploader.tsx (line 44)](/Users/mac/Desktop/baolecheng/MSA/26WP/wp-a/components/AvatarUploader.tsx:44) | 学生可把头像设成同 bucket 任意 URL，包括别人的图片或不存在的 key，导致冒用/坏图 | 头像也保存 `key`，服务端校验 `key.startsWith(personId + "/")`，再计算 public URL |
| P2   | presigned PUT 只限制 content-type，不校验对象大小和真实内容 | [app/api/upload-url/route.ts (line 51)](/Users/mac/Desktop/baolecheng/MSA/26WP/wp-a/app/api/upload-url/route.ts:51), [lib/r2.ts (line 42)](/Users/mac/Desktop/baolecheng/MSA/26WP/wp-a/lib/r2.ts:42) | 登录账号可上传超大或伪装文件，占 R2 存储/带宽；次数限制是内存级，跨实例不强 | 保存图片记录前 `HeadObject` 校验 size/content-type，失败即删除；不要在保存前暴露最终 publicUrl |
| P2   | 学生登录接口缺少运行时类型校验                              | [app/api/auth/login/route.ts (line 28)](/Users/mac/Desktop/baolecheng/MSA/26WP/wp-a/app/api/auth/login/route.ts:28) | 恶意或 malformed JSON 可能触发 500；现场排障会被噪音干扰     | 按 admin login 的写法校验 body 是 object，`username/password` 是 string，并限制长度 |
| P2   | 多个 admin 写接口直接解构 `request.json()`                  | [reset-password (line 12)](/Users/mac/Desktop/baolecheng/MSA/26WP/wp-a/app/api/admin/reset-password/route.ts:12), [takedown (line 10)](/Users/mac/Desktop/baolecheng/MSA/26WP/wp-a/app/api/admin/takedown/route.ts:10), [location (line 10)](/Users/mac/Desktop/baolecheng/MSA/26WP/wp-a/app/api/admin/location/route.ts:10), [settings (line 24)](/Users/mac/Desktop/baolecheng/MSA/26WP/wp-a/app/api/admin/settings/route.ts:24) | admin 误操作、脚本请求或坏 JSON 会变成 500                   | 统一加 try/catch 和字段类型校验                              |
| P2   | `npm audit` 报 Next 依赖链 PostCSS moderate advisory        | [package.json (line 23)](/Users/mac/Desktop/baolecheng/MSA/26WP/wp-a/package.json:23) | 当前未看到用户 CSS stringify 场景，风险不是立即爆炸，但应跟进补丁 | 升级到官方已修复的 Next 版本；不要执行 `npm audit fix --force`，它会尝试破坏性降级 |
| P3   | 重置密码不会失效旧 session                                  | [lib/auth.ts (line 108)](/Users/mac/Desktop/baolecheng/MSA/26WP/wp-a/lib/auth.ts:108), [reset-password (line 28)](/Users/mac/Desktop/baolecheng/MSA/26WP/wp-a/app/api/admin/reset-password/route.ts:28) | 如果纸条/账号已泄露，改密码后旧登录态仍可用到 14 天          | 加 `sessionVersion` 或 `passwordChangedAt`，JWT 校验时比对   |

**确认没问题的点**

- `.env` 未被 git 跟踪，`.gitignore` 正确排除 `.env*`。
- session cookie 是 server-set、httpOnly、production 下 secure，符合活动 10+ 天登录保持目标。
- `next` 回跳已限制站内路径，未发现 open redirect。
- 密码使用 scrypt + `timingSafeEqual`，没有默认 JWT secret fallback。
- gallery 图片保存已校验 `key` 归属和 URL 一致性，并用 Serializable transaction 控制 4 张上限。
- 收藏读取路径保持单向，没有发现“谁收藏了我”的反向读接口。

**验证结果**

- `npx tsc --noEmit`：通过
- `npm run build`：通过
- `npm run audit:harness`：通过
- `npm run lint`：0 error，10 warning
- `npm audit --omit=dev`：失败，2 个 moderate，均来自 Next/PostCSS advisory

本次是审查，没有改代码或文档。
