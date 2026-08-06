> **历史评审快照，不代表当前代码或风险状态。** 当前安全边界见 `docs/08_v1.1_工程基线与契约.md`；2026-08-06 安全修复及发布要求见 `docs/13_security-fix_生产部署交接.md`。

结论
按这个项目的真实定位——150 人左右 OWeek 活动、10+ 天、学生登录一次、运营集中管理、无企业级合规/高可用要求——当前实现的安全与可靠性总体是够用且方向正确的。它没有过度设计，核心高风险点（会话持久、上传绕服务器、收藏单向、管理员入口、密码哈希）基本都按项目规格落地。

我会把审查结论分成三档：

等级	结论	是否阻塞上线
P0	未发现会直接导致学生越权改别人主页、公开泄露密码、绕过登录看主页的硬伤	不阻塞
P1	有几个上线前应确认/加固的点：密钥强度只靠人工、内存限流在 Vercel 多实例下不严格、上传 URL 可被用来传较大对象	建议上线前处理或接受风险
P2	若干小可靠性问题：部分 API JSON 解析失败会 500、学生登录输入类型校验不如 admin 严、lint 当前环境跑不起来	不阻塞功能，但应修
本次按你的要求只读审查，未改代码，未提交 commit，也未创建 PR。

项目场景基线
这个系统不是企业后台，也不是长期社交产品。它的核心目标是：新生用手机编辑主页，别人通过 /loc/{code} 找位置、通过 /u/{code} 看主页，活动期 10+ 天不断登录态；运营负责批量导入、位置维护、下架和重置密码。PRD 明确是 OWeek 期间通过两次 NFC/二维码触达完成线下相遇，规模约 150 人、300 张标签。 

v2.0 的安全目标也很具体：浏览和编辑都变成登录后身份，编辑从 editToken 改成 session cookie，收藏从 localStorage 改成服务端单向收藏，不做通知、不展示谁收藏了我。 

所以评价标准不应是“银行级”“企业级零信任”“多区域容灾”，而是：

学生不能改别人主页。

未登录不能浏览 /u、/loc 和收藏。

登录态要尽量撑过活动期。

管理员入口不能被轻易撞开。

图片上传不能压垮服务器。

收藏不能反向暴露“谁收藏了我”。

出问题时运营能下架、重置密码、重新发纸条。

按这个标准，当前代码大体是合格的。

做得对的地方
1. 学生登录态用 server-set httpOnly cookie，符合活动期可靠性目标
规格里最关键的要求是：登录态必须通过服务端 Set-Cookie 下发 httpOnly cookie，避免 iOS Safari ITP 对脚本写 cookie / localStorage 的 7 天左右限制。 

实现上，学生 session cookie 是 owk_session，httpOnly: true，生产环境 secure: true，sameSite: "lax"，maxAge 为 14 天。  登录接口成功后由服务端 response.cookies.set(setStudentCookie(sessionToken)) 写入，而不是前端 document.cookie。 

这对本项目很重要：活动期是 10+ 天，学生大概率不会每天重新拿纸条登录。这里没有走 localStorage 是正确取舍。

2. /u/[code] 和 /loc/[code] 有登录闸，符合 v2.0 的隐私边界
v2.0 明确要求 /u/[code]、/loc/[code] 加登录闸，未登录带 next 回登录页。 

当前 /u/[code] 在页面开头调用 verifyStudentSession()，无 session 就 redirect 到 /?next=/u/{code}。  /loc/[code] 也做了相同处理。 

登录页还对 next 做了站内路径校验，要求以 / 开头且不能是 //，避免开放重定向。  客户端提交后再次用同样规则校验 next，再 router.push。 

这部分是安全边界的主干，基本正确。

3. 学生只能改自己：/api/me、图片、上传 URL 都从 session 取 personId
/api/me 的 GET/PATCH 都先验证学生 session，并且数据库查询、更新都用 session.personId，没有接受客户端传来的 personId 或 code 来决定修改对象。 

图片保存接口同样从 session 取人，并且要求 key 以 ${session.personId}/ 开头，url 必须等于服务端根据 key 计算出的 public URL。 

上传 URL 接口也必须登录，并把 R2 key 放在 ${session.personId}/${nanoid()}.${ext} 下面。 

这意味着学生不能简单通过改请求体来替别人上传图片或改资料。对这个项目来说，这是最重要的授权正确性。

4. 密码存储方式符合冻结技术栈：scrypt + salt + timingSafeEqual
规格要求不用 bcrypt/argon2，使用 Node 内置 node:crypto scrypt，并用 timingSafeEqual 比较。 

实现里 hashPassword() 每次生成 16 字节随机 salt，scrypt 输出 64 字节 hash，格式为 salt_hex:hash_hex；verifyPassword() 重新计算后用 timingSafeEqual。 

对“运营提前批量生成 12 位可打印密码、学生短期使用”的场景，这个强度是合理的。密码本身由 nanoid 自定义 alphabet 生成，12 位，排除了部分视觉混淆字符。 

5. 收藏模型保持单向，未看到“谁收藏了我”的业务读路径
规格强调收藏必须单向静默：不通知、不显示次数、不显示是谁；favoritesReceived 只为级联删除。 

数据模型里确实有 favoritesGiven / favoritesReceived 两个 Prisma relation，但 Favorite 上只有 @@index([favoriterId])，没有给 favoriteeId 单独建查询索引。 

业务代码中 /api/me/favorites 只按当前登录者的 favoriterId 查询“我收藏的人”。  收藏按钮初始状态只查“当前登录者是否收藏目标”这一对关系，不是反查谁收藏了目标。 

这符合产品上的隐私承诺。

6. 图片链路是 presigned 直传，不压服务器；并有双重数量校验
规格要求前端压缩、请求 presigned PUT URL、直传 R2，再调用 /api/me/images 存记录，且图片数量服务端双重校验。 

当前 /api/upload-url 会校验登录、限流、content type、当前图片数 < 4，然后返回 R2 presigned URL。  /api/me/images 保存时再次在 Serializable transaction 中 count 图片数，超过 4 就拒绝，并对 P2034 序列化冲突最多重试 3 次。 

这对可靠性很关键：上传大文件不经 Vercel function 转发，减少超时和带宽风险；并发上传也不会轻易突破 4 张限制。

7. 管理员批量导入是事务写入，失败不会留下半批数据
规格要求导入名单必须批量事务写入，不要逐条 create，避免 Vercel function 超时和半批数据。 

实现中先规范化 rows、生成 code/editToken/password，再用 $transaction 同时 createMany Person 和 LocationCard。 

这对 150 人导入是合适的可靠性设计。

主要风险与建议
P1-1：SESSION_SECRET / ADMIN_PASSWORD 只检查“存在”，没有检查强度
规格明确写了 SESSION_SECRET 至少 32 字节随机串，并指出 jose 不会自动校验 key 长度；ADMIN_PASSWORD 也建议足够长。 

当前 getRequiredEnv() 只检查 env 是否存在且 trim 后非空。  ADMIN_PASSWORD 直接作为 admin 口令，同时也作为 admin JWT HMAC secret。  SESSION_SECRET 也是直接 encode 后用于 HS256。 

这不是代码逻辑漏洞，但属于配置安全风险：如果生产环境误填了短 secret，比如 123456 或活动名，JWT 签名强度会明显下降。

按项目级别的建议：

不需要接入 KMS、不需要密钥轮换系统。

但上线前应该人工确认 Vercel：

SESSION_SECRET 用 openssl rand -base64 48 级别随机值。

ADMIN_PASSWORD 不要用普通活动口令，至少 16–24 位随机。

如果之后允许改代码，建议在 getSessionSecret() 或启动时对长度做 fail-closed；这属于小改动、高收益。

P1-2：登录/上传限流是内存 Map，在 Vercel 多实例下不是全局限流
checkRateLimit() 用模块级 Map 保存计数。  学生登录接口使用每 IP 15 分钟 20 次、每 username 15 分钟 5 次。  admin 登录是每 IP 15 分钟 10 次。  上传 URL 是每用户 10 分钟 20 次。 

这对单实例或低流量场景有效，但在 serverless 多实例下不是全局限流：不同冷启动实例各有自己的 Map；实例回收后计数也消失。

按项目级别判断：

这不是企业级业务，不值得为了 150 人活动引入 Redis / Upstash / 专门 WAF 复杂度。

当前限流足以挡住误操作、普通脚本和学生手动乱试。

真正要防的是活动期间有人撞管理员口令或批量撞学生密码。这个风险主要靠：

强 ADMIN_PASSWORD；

12 位随机学生密码；

不公开 username/password 列表；

Cloudflare/Vercel 基础防护。

建议：

可接受当前实现，但上线前务必确认密码强度。

如果部署后看到异常 401/429 日志，再考虑 Cloudflare WAF rate rule，而不是先上数据库限流。

P1-3：presigned PUT URL 只约束 Content-Type，不约束实际文件大小/内容
上传 URL 接口只允许 image/jpeg、image/png、image/webp 三类 content type。  但 presigned PUT 本身没有在代码层约束 Content-Length，也没有在保存 image record 前 HEAD R2 对象验证大小或 MIME。 

这意味着登录学生可以请求一个合法 content type 的 PUT URL，然后上传比前端压缩预期更大的对象。由于上传直达 R2，不会压垮 Vercel function，但会消耗 R2 存储/流量。

按项目级别判断：

这个风险被限制在“已登录学生账户”范围内。

每个用户 10 分钟最多 20 个 upload URL。 

图片记录最多 4 张，但未保存进数据库的 R2 对象可能残留。

对 150 人活动，风险更多是“个别学生误传大图/恶作剧”，不是公开互联网上任意人刷爆。

建议：

上线可接受，但运营上应设置 R2 bucket 生命周期规则，定期清理未被数据库引用的对象或限制存储成本。

如果之后改代码，较轻量的做法是保存前对 R2 对象做 HEAD 校验大小，超过阈值则删除并拒绝；不建议改成服务器中转上传，因为这违反现有架构取舍。

P1-4：generateMetadata() 在登录闸之前查询姓名，会让页面标题成为一个轻微信息侧信道
/u/[code] 的 generateMetadata() 会在不检查学生 session 的情况下按 code 查询 person，并把中文名或 code 放进 title。  /loc/[code] 也会查 location name 并放入 title。 

页面主体有登录闸，但 metadata 阶段已经查了名字。

按项目级别判断：

code 是 6 位 nanoid，且链接主要在实体 NFC/二维码上流转；不是高度敏感系统。

但 v2.0 已经把 /u、/loc 设为登录后访问，严格说标题也不应在未登录时透露姓名。

搜索引擎或聊天软件预览理论上可能拿到 title。

建议：

不算阻塞上线。

如果想把隐私边界收紧，metadata 对未登录统一返回 “OWeek 个人主页 / 位置页”，不要查姓名。

对这个活动规模，这是低成本、低风险的小改进。

次要可靠性问题
P2-1：部分 API 对 malformed JSON 没有 try/catch，会返回 500 而不是 400
管理员重置密码接口直接 await request.json()，没有捕获 JSON parse 错误，也没有校验 code 类型。 

相比之下，admin login 和 /api/me 都对 JSON body 做了 try/catch 和对象类型校验。 

影响：

正常后台 UI 不会触发。

恶意或错误请求会得到 500，日志有噪音。

不影响权限，因为前面有 admin session 校验。 

建议：

非阻塞。

后续顺手把 reset-password 的 body 解析改成和 admin login 一样即可。

P2-2：学生登录接口对 username/password 类型校验弱于 admin login
学生登录接口从 JSON 里取 body.username、body.password 后，只检查 truthy，没有确认两者是 string。  然后把 username 传给 Prisma findUnique，把 password 传给 verifyPassword()。 

admin login 则显式确认 password 是 string。 

影响：

正常 UI 不受影响。

恶意构造非字符串可能导致 Prisma validation error 或 crypto 参数异常，形成 500。

不太可能绕过登录，但会产生可靠性噪音。

建议：

非阻塞。

后续应把学生登录的类型校验补齐：typeof username === "string"、typeof password === "string"，并 trim username。

P2-3：学生 JWT payload 没有显式校验 role/pid 类型
verifyStudentSession() 验签后直接返回 payload.pid as string，没有检查 role === "student" 或 pid 是否为非空 string。 

由于 token 是 HS256 签名，只要 SESSION_SECRET 足够强，外部不能伪造 payload。这个问题本身不严重。但稳妥性上，应该显式检查 payload shape，避免未来复用 secret 或 payload 结构变化时出错。

建议：

低优先级。

保持两套 cookie 和 secret 独立即可；如果补代码，顺手检查 payload.role === "student"。

P2-4：/loc 页面文案说“位置由 TA 设置”，但位置实际是运营设置
PRD 和 v2.0 都写位置页由运营编辑。 

但 /loc/[code] 页面引导文案写的是“位置由 TA 设置”。 

这不是安全问题，但会影响活动现场支持：学生可能以为自己能改位置，或者位置错误时不知道找运营。

不建议上升到企业级复杂度的点
这些点在企业系统里可能会被要求，但在这个项目里不值得：

企业级常见要求	本项目是否需要	原因
Redis/数据库全局限流	暂不需要	150 人活动，随机密码 + Cloudflare/Vercel 基础防护足够；内存限流先挡误操作
MFA / SSO	不需要	新生当天组长引导登录，密码纸条场景，MFA 会显著增加现场失败率
密钥自动轮换	不需要	活动期短，人工生成强 secret 更重要
审计日志体系	暂不需要	可考虑简单日志，但不应引入复杂后台
图片病毒扫描	不需要	仅图片展示，已限制 content type；规模小，风险可接受
服务端代理上传	不应做	会增加 Vercel 超时/带宽风险，且违反当前 presigned 直传架构
上线前最低检查清单
这不是代码改动，只是运维确认：

Vercel 环境变量

SESSION_SECRET：至少 32 字节随机串。

ADMIN_PASSWORD：不要用短口令或活动名。

DATABASE_URL：Neon pooled。

DIRECT_URL：仅迁移使用，不进 app runtime。

R2 相关变量完整。

真机浏览器

iPhone Safari 登录一次，隔几天复测 /u/{code}、/loc/{code} 是否仍保持登录。

微信内置浏览器打开时是否显示“请用系统浏览器打开”的提示；当前 LoginForm 已做微信 UA 提示。 

活动现场流程

密码纸条只在导入/重置当刻可见；export 不包含密码。导出接口只输出 chineseName、englishName、username、code、homepage、location。 

重置密码后要把新密码线下交给本人，不要在群里发。

R2 成本防护

给 bucket 配生命周期或人工清理策略，防止 presigned 上传但未保存到数据库的对象长期残留。

使用过的命令
Testing / Checks

✅ pwd && rg --files -g 'AGENTS.md' -g 'docs/*.md' -g 'app/**' -g 'lib/**' -g 'prisma/**' -g 'package.json' -g 'middleware.ts' -g 'next.config.*' | sed -n '1,160p'

✅ sed -n '1,220p' AGENTS.md && sed -n '1,220p' docs/04_开发文档_v2.0_账号系统迁移.md && sed -n '1,180p' docs/01_PRD_OWeek个人主页系统_v1.0.md

✅ nl -ba lib/auth.ts | sed -n '1,260p'; nl -ba app/api/auth/login/route.ts | sed -n '1,220p'; nl -ba app/api/admin/login/route.ts | sed -n '1,180p'; nl -ba app/api/me/route.ts | sed -n '1,260p'

✅ nl -ba app/api/upload-url/route.ts | sed -n '1,260p'; nl -ba app/api/me/images/route.ts | sed -n '1,260p'; nl -ba app/api/favorites/route.ts | sed -n '1,220p'; nl -ba app/api/me/favorites/route.ts | sed -n '1,180p'

✅ nl -ba app/u/[code]/page.tsx | sed -n '1,240p'; nl -ba app/loc/[code]/page.tsx | sed -n '1,220p'; nl -ba app/api/admin/import/route.ts | sed -n '1,260p'; nl -ba lib/rate-limit.ts | sed -n '1,120p'

✅ nl -ba lib/r2.ts | sed -n '1,220p'; nl -ba lib/prisma.ts | sed -n '1,160p'; nl -ba prisma/schema.prisma | sed -n '1,180p'; nl -ba app/api/admin/reset-password/route.ts | sed -n '1,180p'; nl -ba app/api/admin/export/route.ts | sed -n '1,160p'

✅ rg -n "favoritesReceived|favoriteeId|verifyStudentSession|document\\.cookie|localStorage|runtime = 'edge'|runtime = \\\"edge\\\"|DIRECT_URL|DATABASE_URL|ADMIN_PASSWORD|SESSION_SECRET" app lib prisma docs/04_开发文档_v2.0_账号系统迁移.md

✅ nl -ba docs/01_PRD_OWeek个人主页系统_v1.0.md | sed -n '1,90p'; nl -ba docs/04_开发文档_v2.0_账号系统迁移.md | sed -n '1,320p' | sed -n '20,80p;180,210p;228,252p;300,310p'

✅ nl -ba app/page.tsx | sed -n '1,120p'; nl -ba app/LoginForm.tsx | sed -n '1,200p'

⚠️ npm run lint — 当前环境缺少可解析的 eslint 包，命令在加载 eslint.config.mjs 时失败：Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'eslint' imported from /workspace/wp-a/eslint.config.mjs。我没有运行 npm install，因为本次任务要求只读审查。
