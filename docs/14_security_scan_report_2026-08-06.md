# OWeek 个人主页系统 · 安全扫描报告（2026-08-06）

> 扫描工具：`@openai/codex-security` 0.1.6 + DeepSeek `deepseek-v4-flash`（max 推理档）
> 扫描方式：5 分区并行（互不重叠，覆盖全仓 152 个 TS 文件）
> 扫描时长：约 105 分钟；报告由 findings.json 渲染（上游 seal bug 已绕过，P1/P2 完整成功）

## 执行摘要

- 共 **14 个 finding**，去重后 11 个独立问题（1 个 medium，其余 low）
- 重复项已聚类标注：同一根因的多个导出点/路由计为一族

| # | 严重度 | 问题 | 规则 | 分区 | 重复关系 |
|---|--------|------|------|------|----------|
| 1 | medium | Open redirect after local login via control-characte | `open-redirect.return-to-control-ch` | P3 | 新发现 |
| 2 | low | Account purge permanently destroys historical audit  | `audit-integrity.actor-attribution-` | P1 | 历史重复（17:33 扫描） |
| 3 | low | Authenticated uploads bypass presign rate limiting,  | `resource-exhaustion.upload-control` | P1 | 新发现 |
| 4 | low | CSV formula injection in admin NFC exhibition URL ex | `csv-injection.admin-exhibition-exp` | P3 | 同族：本报告 #4/#5/#6 三个导出点同根因；历史 15:03/17:33 扫描均确认 |
| 5 | low | CSV formula injection in admin account exports | `injection.csv-formula-injection` | P5 | 同族：本报告 #4/#5/#6 三个导出点同根因；历史 15:03/17:33 扫描均确认 |
| 6 | low | CSV formula injection in admin credentials export | `csv-injection.admin-credentials-ex` | P3 | 同族：本报告 #4/#5/#6 三个导出点同根因；历史 15:03/17:33 扫描均确认 |
| 7 | low | Display-name changes are not recorded in account aud | `audit-integrity.missing-identity-f` | P1 | 历史重复（17:33 扫描） |
| 8 | low | Email import duplicate checks are case-sensitive whi | `identity-canonicalization.email-ca` | P1 | 新发现 |
| 9 | low | Gallery reads have no rate limit and query up to 1,0 | `rate-limit.missing-on-gallery-read` | P1 | 新发现 |
| 10 | low | IP rate limits and request metadata trust spoofable  | `rate-limit.client-identity-spoofin` | P1 | 历史重复（15:03 扫描） |
| 11 | low | Login timing difference allows account-code enumerat | `user-enumeration.login-timing-orac` | P5 | 相关但向量不同（15:03 扫描为状态码枚举，本次为时序枚举） |
| 12 | low | Unauthenticated file reads from the local media stor | `missing-authentication.storage-rea` | P1 | 同根因：15:0x 扫描 local-upload GET 未鉴权 |
| 13 | low | Unauthenticated requests force full body buffering b | `resource-exhaustion.request-body-b` | P1 | 新发现 |
| 14 | low | Unauthenticated requests force full body buffering b | `resource-exhaustion.request-body-b` | P1 | 新发现 |

---

## 详细发现（按严重度排序）

### 1. [medium] Open redirect after local login via control-character bypass in returnTo

- **规则**：`open-redirect.return-to-control-character-bypass`　**置信度**：high　**重复关系**：新发现
- **位置**：
  - `app/page.tsx:10-16` (entrypoint)
  - `app/login/page.tsx:7-9` (root_control)
  - `components/student/api.ts:58-61` (root_control)
  - `lib/server/login-handler.ts:25-27` (evidence)
  - `app/login/LoginClient.tsx:44-47` (sink)
- **严重度理由**：An unauthenticated attacker can craft a login link that redirects a successfully authenticated user to an external origin. The session cookie remains HttpOnly and same-origin, so credentials are not directly exfiltrated, but the trusted-origin redirect enables phishing and login-confusion after authentication. The exploit requires only that the victim click the link and complete a normal login, making likelihood high; impact is limited to misleading navigation rather than direct session or data loss.
- **升级条件**：Evidence that a browser rejects the tab-containing navigation (for example a browser that refuses to strip ASCII controls before host parsing) would lower severity to low; evidence that the redirected page can read or replay the victim session would raise severity to high.
- **概述**：The login flow accepts `returnTo`/`next` values containing ASCII tab, CR, or LF. Every `safeReturnTo` variant only checks `startsWith("/")`, `!startsWith("//")`, and (on the client) `!includes("\\")`, so a value like `/%09//evil.com` passes validation, is echoed by the login API, and is assigned to `window.location.assign` after a successful login. The WHATWG URL parser strips the tab before parsing, turning the value into the protocol-relative `//evil.com` and navigating the victim to an attacker-controlled origin.
- **根因**：The violated invariant is that any `returnTo`/`next` accepted from the query string must remain a same-origin relative path after browser URL normalization. The guards compare the raw string before URL parsing and never reject ASCII tab/CR/LF, which the WHATWG URL parser removes before determining the host, so `"/\t//evil.com"` becomes an external `//evil.com` navigation.
- **攻击路径**：An attacker sends a victim a link such as `https://msoweek.site/login?returnTo=/%09//evil.com`. The victim authenticates normally; the login response returns the tab-containing `returnTo`; `LoginClient` assigns it to `location`, and the browser strips the tab and navigates to `https://evil.com/`.
- **修复建议**：Use one canonical URL normalization guard for every return target: strip/reject ASCII control characters and backslashes before the prefix checks, then parse the result with `new URL(value, APP_BASE_URL)` and require the resolved origin to equal `APP_BASE_URL` and the pathname to start with `/`; otherwise fall back to `/home`. Apply the same guard in `app/page.tsx`, `app/login/page.tsx`, `components/student/api.ts`, `lib/server/login-handler.ts`, and `lib/server/oidc.ts`.

### 2. [low] Account purge permanently destroys historical audit actor attribution

- **规则**：`audit-integrity.actor-attribution-loss`　**置信度**：high　**重复关系**：历史重复（17:33 扫描）
- **位置**：
  - `app/api/v1/admin/accounts/bulk/route.ts:93-107` (root_control)
  - `lib/server/audit.ts:24-38` (evidence)
  - `app/api/v1/admin/audit-logs/route.ts:69-77` (evidence)
- **严重度理由**：The purge operation is admin-triggered and itself audited, but the historical attribution for the purged accounts' prior privileged actions is destroyed; the impact is audit-integrity degradation rather than direct data exposure.
- **升级条件**：Regulatory or incident-response requirements for actor retention would raise severity; preserving an actor snapshot would close the issue.
- **概述**：PURGE_ARCHIVED nulls actorUserId on every historical AdminAuditLog row whose actor is purged and deletes the actor's idempotency records, so past admin actions are permanently re-attributed to SYSTEM and audit forensics is weakened.
- **根因**：The violated invariant is that privileged admin actions remain attributable after account deletion. The purge routine nulls the actor FK on historical rows instead of preserving a durable actor snapshot, destroying forensic attribution for the accounts most relevant to incident review.
- **攻击路径**：An ADMIN runs PURGE_ARCHIVED on archived accounts; all past audit rows attributed to those accounts lose their actor, and the audit UI re-labels them as SYSTEM.
- **修复建议**：Preserve a durable actor snapshot (accountCode or an immutable actor label) on audit rows before purge, or soft-delete actors instead of nulling actorUserId on historical rows.

### 3. [low] Authenticated uploads bypass presign rate limiting, idempotency, and asset cap in local media mode

- **规则**：`resource-exhaustion.upload-control-bypass`　**置信度**：high　**重复关系**：新发现
- **位置**：
  - `app/api/local-upload/route.ts:16-43` (entrypoint)
  - `app/api/local-upload/route.ts:41-42` (sink)
  - `app/api/v1/assets/presign/route.ts:40-52` (evidence)
- **严重度理由**：The control bypass is real but confined to the dev-only storage mode and requires an authenticated attacker; production R2 flow is unaffected.
- **升级条件**：Deploying local mode to a shared host would raise severity; applying the presign rate limit and cap would close the issue.
- **概述**：In LOCAL_UPLOAD_DIR mode, PUT /api/local-upload is the real upload path returned by createPresignedUploadUrl, but it lacks the presign flow's persistent rate limit, idempotency binding, and global asset cap, allowing any authenticated student to write unlimited 512KB files and fill local disk.
- **根因**：The violated invariant is that every upload path applies rate limiting, idempotency, and the asset cap. The local-mode PUT handler, which is the effective upload URL in that mode, writes bytes directly with only a per-file size check.
- **攻击路径**：An authenticated student calls PUT /api/local-upload repeatedly with their own userId in the key; each 512KB write succeeds without rate limiting or asset binding, filling local disk in dev/self-hosted mode.
- **修复建议**：Apply the same persistent rate limit, idempotency, and asset-cap checks used by the presign flow to PUT /api/local-upload, or route local-mode uploads through the presign endpoint.

### 4. [low] CSV formula injection in admin NFC exhibition URL export

- **规则**：`csv-injection.admin-exhibition-export`　**置信度**：medium　**重复关系**：同族：本报告 #4/#5/#6 三个导出点同根因；历史 15:03/17:33 扫描均确认
- **位置**：
  - `app/admin/accounts/page.tsx:1-4` (entrypoint)
  - `components/admin/AdminAccounts.tsx:357-375` (entrypoint/wrapper)
  - `lib/csv.ts:1-11` (root_control)
  - `app/api/v1/admin/accounts/export-exhibition/route.ts:46-53` (sink)
- **严重度理由**：This export contains display names, group names, and artwork URLs rather than passwords. Formula execution requires an admin to open the CSV in a formula-capable spreadsheet and an attacker-influenced group or display name to exist; modern spreadsheet hardening limits reliable auto-execution, so the severity remains low.
- **升级条件**：Evidence that display or group names are sanitized before storage, or that the production spreadsheet workflow disables formulas, would make this not applicable; evidence of reliable auto-execution would raise severity to medium.
- **概述**：The server-side NFC exhibition export builds CSV rows with `csvRow`/`csvCell`, which only quote commas, quotes, and newlines. `displayName` and `groupName` values that begin with `=`, `+`, `-`, or `@` are written verbatim, so opening the exported `oweek-nfc-exhibition-links.csv` in a spreadsheet can evaluate attacker-influenced cells as formulas.
- **根因**：The violated invariant is that exported CSV cells must remain inert text. `csvCell` performs RFC-style quoting only and never neutralizes spreadsheet formula prefixes, so attacker-influenced `displayName`/`groupName` values become formulas when the admin opens the NFC export.
- **攻击路径**：An attacker-influenced display or group name beginning with `=` is stored via the admin import/rename/group-creation flows. An admin exports the selected ACTIVE accounts as the NFC CSV and opens it in a spreadsheet, where the formula cell is evaluated.
- **修复建议**：Neutralize spreadsheet formula prefixes inside `lib/csv.ts` `csvCell` (prefix cells starting with `=`, `+`, `-`, `@`, tab, or CR with a single quote) so every admin CSV export is safe, and add a regression test for the NFC exhibition export.

### 5. [low] CSV formula injection in admin account exports

- **规则**：`injection.csv-formula-injection`　**置信度**：medium　**重复关系**：同族：本报告 #4/#5/#6 三个导出点同根因；历史 15:03/17:33 扫描均确认
- **位置**：
  - `lib/csv.ts:1-15` (root_control)
  - `lib/server/admin-accounts.ts:134-139` (concrete_implementation)
  - `app/api/v1/admin/accounts/export-exhibition/route.ts:45-61` (sink)
  - `app/api/v1/admin/accounts/import/route.ts:33-36` (entrypoint)
- **严重度理由**：Impact is client-side formula execution on an admin workstation (potential data exfiltration or local file access depending on the spreadsheet application and formula payload). It requires an admin to import a data set containing a formula-leading cell, then open the exported CSV in a formula-capable spreadsheet; no server-side impact exists.
- **升级条件**：A demonstrable realistic payload (for example a roster name using `=HYPERLINK(...)`) or evidence that admins routinely open these CSVs would raise severity to medium.
- **概述**：`csvCell` escapes commas, quotes, and newlines but does not neutralize cells beginning with `=`, `+`, `-`, or `@`. Account display names imported from rosters, group names, and randomly generated initial passwords (whose alphabet includes formula triggers) are written into credentials CSVs and the exhibition-link CSV, so opening one of these exports in Excel, LibreOffice, or Google Sheets can execute spreadsheet formulas.
- **根因**：The violated invariant is that exported CSV cells must be inert text when they begin with spreadsheet formula characters. `csvCell` only quotes delimiters and doubles quotes, so formula-leading cells pass through unchanged and become executable formulas when the file is opened.
- **攻击路径**：An admin imports a roster containing a display name such as `=HYPERLINK("https://attacker.example","click")` (or a generated password starts with a formula character), later exports/downloads the credentials or exhibition CSV, and opens it in a spreadsheet; the spreadsheet evaluates the formula, enabling external-link navigation or local formula side effects on the admin workstation.
- **修复建议**：In `csvCell` (and `csvRow`), prefix any cell that starts with `=`, `+`, `-`, `@`, tab, or carriage return with a single quote (`'`) so spreadsheets treat it as text; keep the existing quote escaping for delimiters.

### 6. [low] CSV formula injection in admin credentials export

- **规则**：`csv-injection.admin-credentials-export`　**置信度**：medium　**重复关系**：同族：本报告 #4/#5/#6 三个导出点同根因；历史 15:03/17:33 扫描均确认
- **位置**：
  - `app/admin/accounts/page.tsx:1-4` (entrypoint)
  - `components/admin/AdminAccounts.tsx:22-24` (root_control)
  - `components/admin/AdminAccounts.tsx:42-47` (sink)
  - `lib/server/admin-accounts.ts:134-138` (evidence)
- **严重度理由**：Exploitation requires an attacker to get a formula-prefixed display name into the account database (through admin paste/import or a rename) and requires the admin to download and open the credentials CSV in a spreadsheet application with formula execution enabled. Modern spreadsheet apps have partial hardening (DDE is disabled by default and formula prompts may appear), so impact is limited to the admin workstation; the exported file does contain initial passwords, which makes disclosure meaningful if a formula exfiltrates cell contents.
- **升级条件**：Evidence that the production spreadsheet workflow auto-executes formula cells without prompts would raise severity to medium; evidence that display names are always sanitized on import would make the finding not applicable.
- **概述**：The admin credentials CSV is generated by `csvCell`, which quotes only commas, quotes, and newlines. A `displayName` beginning with `=`, `+`, `-`, or `@` (for example one pasted by an admin from a shared spreadsheet into the account import dialog) is emitted verbatim into the CSV. When the admin opens the exported credentials file in a spreadsheet application, the cell is interpreted as a formula rather than text, which can leak the file contents or execute attacker-controlled behavior on the admin workstation.
- **根因**：The violated invariant is that admin-generated CSV files must treat database field values as inert data. `csvCell` implements RFC-style quoting but never neutralizes spreadsheet formula prefixes (`=`, `+`, `-`, `@`), so attacker-influenced display names are interpreted as executable formulas when an admin opens the export.
- **攻击路径**：An attacker prepares a name list where one display name starts with a spreadsheet formula (for example `=HYPERLINK(...)` or `=cmd|...`). The admin pastes the list into the import dialog and creates accounts; later the admin exports the one-time credentials CSV and opens it in Excel or LibreOffice, which evaluates the formula cell and may fetch attacker URLs or execute commands with the file's data.
- **修复建议**：Neutralize spreadsheet formula prefixes in every CSV cell: prefix values starting with `=`, `+`, `-`, `@`, tab, or CR with a single quote (or strip the prefix) inside `csvCell`/`csvRow`, and apply the same guard to the credentials download in `components/admin/AdminAccounts.tsx` and to `lib/server/admin-accounts.ts`.

### 7. [low] Display-name changes are not recorded in account audit logs

- **规则**：`audit-integrity.missing-identity-field`　**置信度**：high　**重复关系**：历史重复（17:33 扫描）
- **位置**：
  - `app/api/v1/admin/accounts/[id]/route.ts:89-102` (root_control)
  - `app/api/v1/admin/accounts/[id]/route.ts:64-80` (sink)
- **严重度理由**：The change is still attributed and timestamped, but the identity value itself is missing from the audit trail, reducing accountability for a field shown across the app and exports.
- **升级条件**：Including displayName in the audit before/after would close the issue; incident-response requirements could raise its importance.
- **概述**：ACCOUNT_UPDATED audit records omit displayName before/after even though the PATCH handler writes displayName and displayNameSortKey, so admin identity-field changes are not traceable in the audit log.
- **根因**：The violated invariant is that security-relevant account mutations are fully traceable. The handler updates displayName but the ACCOUNT_UPDATED audit payload omits it, leaving identity changes unaccountable.
- **攻击路径**：An admin changes a user's display name; the audit log records that an update happened but cannot show what the name was or became.
- **修复建议**：Include displayName (and displayNameSortKey) in the ACCOUNT_UPDATED before/after audit payload.

### 8. [low] Email import duplicate checks are case-sensitive while OIDC binding canonicalizes to lowercase

- **规则**：`identity-canonicalization.email-case-variant`　**置信度**：medium　**重复关系**：新发现
- **位置**：
  - `app/api/v1/admin/accounts/import-emails/route.ts:24-29` (entrypoint)
  - `lib/server/admin-email-import.ts:85-96` (root_control)
  - `lib/server/admin-email-import.ts:106-117` (evidence)
  - `lib/server/oidc.ts:252-252` (evidence)
- **严重度理由**：The canonicalization gap is real, but it requires pre-existing mixed-case email rows and a future OIDC deployment; current production is LOCAL_ONLY and all new imports are lowercased.
- **升级条件**：Enabling OIDC with mixed-case legacy emails would raise severity to medium; a case-insensitive uniqueness index or canonical lowercase storage would close the issue.
- **概述**：Email import lowercases incoming rows but checks the case-sensitive Postgres email column with exact lowercase matches, so a pre-existing mixed-case email is not detected as in use; a case-variant duplicate can be provisioned, and OIDC's lowercase exact-match lookup can then bind the identity inconsistently.
- **根因**：The violated invariant is that email identity is canonical and unique regardless of case. The import path normalizes new values to lowercase but checks uniqueness case-sensitively, and the future OIDC path binds with exact lowercase lookup, so mixed-case legacy rows defeat both the conflict check and deterministic binding.
- **攻击路径**：An admin imports foo@example.com while Foo@example.com exists; the import succeeds and provisions a duplicate. When OIDC is later enabled, the lowercased provider email matches one account exactly, creating identity ambiguity.
- **修复建议**：Enforce case-insensitive email uniqueness (e.g., a canonical lowercase column with a unique index, or citext), and make both import conflict checks and OIDC binding query that canonical form.

### 9. [low] Gallery reads have no rate limit and query up to 1,000 user rows per request

- **规则**：`rate-limit.missing-on-gallery-read`　**置信度**：high　**重复关系**：新发现
- **位置**：
  - `app/api/v1/gallery/route.ts:25-45` (entrypoint)
  - `app/api/v1/gallery/route.ts:55-85` (root_control)
- **严重度理由**：The endpoint is authenticated and per-request work is capped at 1,000 rows, so abuse is bounded amplification; still, the route lacks the rate limiting applied to comparable read endpoints.
- **升级条件**：Large event populations or shared-database hosting would raise severity; adding the same persistent rate limit as the artworks endpoint would close the issue.
- **概述**：The gallery endpoint has no persistent rate limit and each request loads up to 1,000 user rows and sorts them in memory; any authenticated student who has submitted the section can issue unbounded requests, causing database/CPU amplification.
- **根因**：The violated invariant is that authenticated read endpoints with nontrivial database work enforce per-identity rate limits. The gallery route loads up to 1,000 rows per request with no persistent rate limiting, allowing repeated authenticated requests to amplify database and CPU load.
- **攻击路径**：An authenticated student with a submitted section repeatedly calls the gallery endpoint; each request performs a 1,000-row query and in-memory sort with no rate limit, amplifying database and CPU load.
- **修复建议**：Apply a persistent per-viewer rate limit to the gallery route (e.g., the same scope pattern as ARTWORK_READ) and reduce the per-request fetch bound or use keyset pagination instead of loading and sorting 1,000 rows.

### 10. [low] IP rate limits and request metadata trust spoofable X-Forwarded-For values

- **规则**：`rate-limit.client-identity-spoofing`　**置信度**：medium　**重复关系**：历史重复（15:03 扫描）
- **位置**：
  - `lib/server/persistent-rate-limit.ts:14-18` (root_control)
  - `lib/server/request-security.ts:18-26` (evidence)
  - `lib/server/login-handler.ts:39-42` (sink)
  - `app/api/v1/auth/oidc/start/route.ts:12-16` (sink)
  - `app/api/v1/artworks/[publicId]/route.ts:31-36` (sink)
- **严重度理由**：The header-trust weakness is real, but Vercel production likely overwrites XFF, per-account login limits and high-entropy initial passwords remain in place, and the practical impact is rate-limit evasion plus inaccurate audit metadata.
- **升级条件**：Confirmation that clients can set XFF at the production edge would raise severity to medium; resolving the client IP from a trusted proxy chain would close the issue.
- **概述**：IP-based rate limits and session/audit metadata trust the first value of the client-supplied x-forwarded-for header (or x-real-ip) with no trusted-proxy verification, allowing header rotation to bypass login, OIDC, presign, and artwork-read rate limits in deployments where clients can set that header.
- **根因**：The violated invariant is that rate-limit and audit identities derive from a source the client cannot forge. clientRateLimitIdentity and getRequestMetadata trust the first XFF entry with no trusted-proxy validation, so in spoofable deployments the IP limits and IP hashes become attacker-influenced.
- **攻击路径**：In a deployment where clients can set XFF, an attacker rotates the header per request to obtain fresh rate-limit buckets on login/OIDC/presign/artwork endpoints and poisons session/audit IP hashes.
- **修复建议**：Derive client identity from a trusted proxy chain (e.g., last trusted XFF entry or the platform-provided IP) and validate that the request came through the trusted proxy; use the same trusted identity for audit/session metadata.

### 11. [low] Login timing difference allows account-code enumeration

- **规则**：`user-enumeration.login-timing-oracle`　**置信度**：medium　**重复关系**：相关但向量不同（15:03 扫描为状态码枚举，本次为时序枚举）
- **位置**：
  - `lib/server/local-auth.ts:54-56` (root_control)
  - `lib/server/passwords.ts:12-26` (sink)
  - `lib/server/login-handler.ts:40-40` (entrypoint)
- **严重度理由**：Impact is limited to confirming which account codes exist (including the publicly documented reserved `SophiaXu` code); no credential disclosure or session compromise follows, and per-account (5/15min) plus per-IP (20/15min) rate limits constrain the number of timing samples an attacker can collect. Confidence in remote observability is unproven because no timing measurement was performed.
- **升级条件**：A production timing measurement showing scrypt dominates round-trip latency, or removal of rate limits, would raise severity; a dummy-hash fix or a measured negligible delta would make the issue non-exploitable.
- **概述**：When a submitted account code does not exist, `authenticateLocalAccount` returns `INVALID_CREDENTIALS` without running the scrypt password verification, so responses for existing accounts include an expensive `scryptSync` computation while responses for missing accounts do not. The reserved `SophiaXu` path is even more distinguishable because it runs the full protected-admin bootstrap transaction before any credential check.
- **根因**：The violated invariant is that login work should not depend on whether an account exists. `authenticateLocalAccount` breaks it by short-circuiting on `!user?.localCredential` before calling the scrypt verifier, so attackers can distinguish existing account codes by response latency despite identical response bodies.
- **攻击路径**：An anonymous attacker submits many login attempts for candidate account codes with arbitrary passwords; existing codes take measurably longer (and `SophiaXu` far longer due to bootstrap), confirming which codes are valid, then attacks the confirmed accounts within the per-account rate-limit window.
- **修复建议**：Run a dummy `verifyLocalPassword` (or equivalent constant-work comparison) whenever the user or credential is missing so missing and existing account codes perform equivalent work before returning the same `INVALID_CREDENTIALS` result.

### 12. [low] Unauthenticated file reads from the local media store when LOCAL_UPLOAD_DIR is enabled

- **规则**：`missing-authentication.storage-read`　**置信度**：high　**重复关系**：同根因：15:0x 扫描 local-upload GET 未鉴权
- **位置**：
  - `app/api/local-upload/route.ts:46-49` (root_control)
  - `app/api/local-upload/route.ts:52-60` (sink)
  - `lib/r2.ts:60-66` (evidence)
- **严重度理由**：Cross-user image exposure is real in local/self-hosted mode, but production does not set LOCAL_UPLOAD_DIR and keys embed random IDs, so exposure requires the dev-only mode plus key knowledge.
- **升级条件**：Enabling LOCAL_UPLOAD_DIR on an internet-reachable host would raise likelihood and severity; requiring a viewer session or removing the public cache would close the issue.
- **概述**：When LOCAL_UPLOAD_DIR is set, GET /api/local-upload serves any file matching the upload key pattern with no session authentication or ownership check, exposing every user's uploaded images to anyone who knows or leaks a key, with public immutable caching.
- **根因**：The violated invariant is that media reads require at least viewer authentication and owner scoping. The GET handler performs no session check, unlike PUT which requires requireFormalViewer, so any caller with a valid key can read any user's files.
- **攻击路径**：An unauthenticated remote client that obtains or guesses a key (keys appear in API responses and client caches) reads any user's locally stored image bytes in local mode.
- **修复建议**：Require an authenticated formal viewer and ownership check on GET /api/local-upload (mirroring PUT), and remove the public immutable cache unless the response is authorized.

### 13. [low] Unauthenticated requests force full body buffering before HMAC check on the internal asset-authorize endpoint

- **规则**：`resource-exhaustion.request-body-before-auth`　**置信度**：high　**重复关系**：新发现
- **位置**：
  - `app/api/internal/assets/authorize/route.ts:16-16` (root_control)
  - `app/api/internal/assets/authorize/route.ts:17-17` (sink)
- **严重度理由**：Same pre-authentication body-buffering pattern as the processed route on a second internal endpoint; per-request work is bounded by platform limits, keeping severity low.
- **升级条件**：Host-level unbounded body acceptance would raise severity; WAF or edge rejection of anonymous large bodies would lower it to ignore.
- **概述**：POST /api/internal/assets/authorize reads the entire request body with request.text() before verifying the worker HMAC signature, allowing unauthenticated clients to force full-body buffering on this route as well.
- **根因**：The same violated invariant as the processed route: authentication must precede expensive body processing. request.text() at line 16 materializes the full body before the HMAC check, so unauthenticated requests still consume buffering and memory.
- **攻击路径**：An unauthenticated remote client sends repeated POST requests with large bodies to the authorize route; each forces body buffering before the HMAC failure, enabling memory/CPU amplification without the worker secret.
- **修复建议**：Verify the HMAC over a streaming or size-bounded body, or enforce a middleware/edge gate that rejects oversized anonymous requests to /api/internal/* before request.text().

### 14. [low] Unauthenticated requests force full body buffering before HMAC check on the internal asset-processed endpoint

- **规则**：`resource-exhaustion.request-body-before-auth`　**置信度**：high　**重复关系**：新发现
- **位置**：
  - `app/api/internal/assets/[assetId]/processed/route.ts:9-9` (root_control)
  - `app/api/internal/assets/[assetId]/processed/route.ts:10-10` (sink)
- **严重度理由**：The route is publicly routable with no middleware gate and the authentication check runs after the body is materialized, so unauthenticated clients can repeatedly trigger memory/CPU amplification. Each request is bounded by platform body limits and autoscaling, which keeps the resource-drain impact low.
- **升级条件**：Evidence that the host accepts unbounded request bodies without a cap would raise severity to medium; deployment behind a WAF or edge that rejects anonymous large bodies would lower it to ignore.
- **概述**：POST /api/internal/assets/{assetId}/processed reads the entire request body with request.text() before verifying the worker HMAC signature, so any internet client can force body buffering and JSON work without possessing ASSET_PROCESSOR_SECRET.
- **根因**：The violated invariant is that unauthenticated requests must be rejected before expensive body processing. The handler instead reads the full request body first and only then verifies the shared-secret HMAC, so an attacker without the secret can still drive body buffering and memory allocation.
- **攻击路径**：An unauthenticated remote client sends repeated POST requests with large bodies to the internal processed route; each request forces full body buffering and a HMAC computation before the 401, enabling memory/CPU amplification without the worker secret.
- **修复建议**：Reject oversized or unauthenticated requests before reading the body: verify the HMAC over a streaming or size-bounded read, or enforce a middleware/edge body-size and method gate on /api/internal/* before request.text().

---

## 附录

- 原始报告：`~/codex-security-results/wp-a-20260806-174728-*/report-from-findings.md`
- 分区覆盖：P1 app/api（36）· P2 app/generated（30）· P3 app 页面（28）· P4 components+lib/domain+lib/contracts（31）· P5 lib/server+lib 单文件（27）
- 历史扫描：2026-08-06 15:03 app/api 3 findings · 17:33 全仓 3 findings（partial）· 更早 app 目录扫描 1 finding（local-upload）
- 修复优先级建议：M1 open redirect 优先；CSV 注入族可一次修完（`lib/csv.ts` 的 `csvCell`）