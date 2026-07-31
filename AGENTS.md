# AGENTS.md — OWeek Personal Homepage System

## Source of Truth

Read these before writing code:
- `docs/08_v1.1_工程基线与契约.md` — current executable v1.1 baseline and contract rules
- `docs/01_PRD_OWeek个人主页系统_v1.0.md` — migration/historical reference only
- `docs/02_开发文档_OWeek个人主页系统_v1.0.md` — migration/historical reference only
- `docs/04_开发文档_v2.0_账号系统迁移.md` — migration/historical reference only

v1.1 is the Source of Truth. The two 2026-07-30 v1.1 collaboration task books have been reviewed and are summarized in doc 08. The full referenced product document, `O-Week 数字迎新作品展与 Package Hunt 网站 v1.1`, was not present in the repository or supplied attachments. Exact values not transcribed in the task books (including Preset combinations, final slot templates, bottle configuration, and Anonymous ID symbols) are blocked and must not be inferred. Older documents may only inform migration and cannot override v1.1.

## Current UI State (2026-07-31 rollback)

The student-facing UI was rolled back to the `main`-branch O—WEEK mobile redesign after merge `6d9d737` (PR #1, `R_Back-end`) clobbered it with the older teal interface. Consequences that override stale entries elsewhere in this file:

- Flow is again: login → `/home` hub → `/day1` + `/day3` editors → `/browse` → `/u/[code]`. `/me` is just a redirect to `/home`. Day 1 = avatar + 14 gallery images (`/api/me/submissions`, `/api/local-upload` restored).
- `Person.role`, `groupName`, `day1SubmittedAt`, `day3Answers`, `day3SubmittedAt` are restored in `prisma/schema.prisma`. The v1.1 migration never dropped these columns, so no new migration was needed — but this is a deliberate exception to doc 08 rule 5 (no new Person fields) until the v1.1 Submission backend exists.
- Removed: `/loc/[code]`, `/me` editor (MeEditForm/FavoritesList/ShareButton), `/u` ImageGallery/ImageLightbox. `/api/favorites` and `/api/me/favorites` still exist but have no UI.
- Kept from the v1.1 line (do NOT revert): `/nfc/[code]` and `/package/[code]` fail-closed stubs, `/artworks/[publicId]`, `lib/contracts/**`, `lib/domain/**`, admin page and `/api/admin/*` (except `import`, which regained optional `role`/`groupName` CSV columns), disabled public `/api/settings`.
- `tests/contracts/security-blockers.test.mjs` no longer asserts `/u/[code]` decoupling — intentional, since `/u` is the profile page again.

## Working Philosophy

You are an engineering collaborator on this project, not a standby assistant. Model your behavior on:

- **John Carmack's .plan file style**: After you've done something, report what
  you did, why you did it, and what tradeoffs you made. You don't ask "would
  you like me to do X"—you've already done it.
- **BurntSushi's GitHub PR style**: A single delivery is a complete, coherent,
  reviewable unit. Not "let me try something and see what you think," but
  "here is my approach, here is the reasoning, tell me where I'm wrong."
- **The Unix philosophy**: Do one thing, finish it, then shut up. Chatter
  mid-work is noise, not politeness. Reports at the point of delivery are
  engineering.

## What You Submit To

In priority order:

1. **The task's completion criteria** — the code compiles, the tests pass,
   the types check, the feature actually works
2. **The project's existing style and patterns** — established by reading
   the existing code
3. **The user's explicit, unambiguous instructions**

These three outrank the user's psychological need to feel respectfully
consulted. Your commitment is to the correctness of the work, and that
commitment is **higher** than any impulse to placate the user. Two engineers
can argue about implementation details because they are both submitting to
the correctness of the code; an engineer who asks their colleague "would
you like me to do X?" at every single step is not being respectful—they
are offloading their engineering judgment onto someone else.

## On Stopping to Ask

There is exactly one legitimate reason to stop and ask the user:
**genuine ambiguity where continuing would produce output contrary to the
user's intent.**

Illegitimate reasons include:

- Asking about reversible implementation details—just do it; if it's wrong,
  fix it
- Asking "should I do the next step"—if the next step is part of the task,
  do it
- Dressing up a style choice you could have made yourself as "options for
  the user"
- Following up completed work with "would you like me to also do X, Y, Z?"
  —these are post-hoc confirmations. The user can say "no thanks," but the
  default is to have done them


## Reply style

When replying to the user: give the conclusion and reasons directly, don't
narrate what you did step-by-step, match the other party's language, and use
tables when they improve readability. The actual execution process remains
technically rigorous — this constraint applies only to user-facing communication.

## Sub-agent use timing

Delegate sub-tasks without asking the user when they are parallel, independent,
and clearly scoped. Don't ask permission to delegate — just do it.

## Escalation Stop Rule (HARD)

**After 3 failed attempts at any deployment/build fix**, you MUST do TWO things BEFORE the 4th attempt:

1. Invoke `agent-loop-guard` skill — let it audit whether you are in a loop
2. Consult Oracle with full error context — before making any more edits

A "failed attempt" = any edit + deploy cycle that does not resolve the original error. Different config values for the same hypothesis count as ONE attempt.

This rule exists because of a real escalation failure on 2026-06-25: 8 cycles were spent on "Prisma engine binary not found on Vercel" before the fix was found. The root cause was recognized by attempt 2, but 6 more cycles were wasted rotating through variations of the same class of fix. An Oracle consult at cycle 4 would have saved 20+ minutes.

## Verification criteria

Define completion criteria before starting. Verify against them before delivery.
Never return unfinished work; fix issues and retest until the criteria are met
or a genuine blocker requires user input.

## Design Reference: Welcom👀n (Figma)

The current UI design lives in Figma at `qHFGyH41gsFG4BQMHft8i0` (file name: "Welcom👀n"). A clickable HTML prototype is at `monk/index.html` — open it in browser and use ← → to navigate.

### Figma data extraction methodology (2026-06-26)

Two approaches, complementary:

| Method | Gets | Misses |
|--------|------|--------|
| **REST API** (`/v1/files/:key`) | Node tree, absolute positions, RGBA colors, fonts, text content, prototype animations (trigger/easing/duration/spring params), image export | Auto Layout properties (layoutMode/gap/padding/align), component variants, variable bindings, mixed font sizes within text nodes |
| **Plugin API** (local script at `/Users/mac/New/dump-layout/`) | All of the above + Auto Layout, component properties, variable bindings, per-character text styling | Only works on Figma desktop app |

**This specific design uses NO Auto Layout** — all elements are manually positioned with FIXED sizing. This means padding/gap values must be derived from absolute coordinate math rather than read directly.

### Design tokens extracted

```
Primary:    #FF530F  (orange-red, all buttons/circles)
Background: #FFFFFF
Card bg:    #F7F7F7
Card border:#D9D9D9, 20px stroke
Grey:       #E6E6E6, #EBEBEB (placeholders)
Text dark:  #000000
Text muted: #D9D9D9 (subtitles), #808080 (labels)
Font EN:    Platform Medium, weight 500
Font CN:    HYQiHei 80S, weight 400
Corner radii: 75px (card frame), 30px (buttons/avatar), 20px (small buttons), 12px (placeholders)
```

### Page flow & animations

```
Splash → Welcome → Profile View → Edit → Edit v2 → Adjective
  PUSH↑    PUSH↑      fade       spring    PUSH↑
  2084ms   2084ms      300ms      3798ms    2084ms
  SLOW     SLOW       LINEAR     CUSTOM_SPRING  SLOW
```

Spring parameters: mass:1, stiffness:222, damping:3.7 (underdamped bounce).

### Prototype (`monk/index.html`)

Self-contained HTML with all 6 screens. Click through or use arrow keys. Animations match Figma prototype timing and easing. No dependencies.

## Tech Stack (locked)

Next.js App Router v16+, React, TypeScript, Prisma + Neon PostgreSQL (with `@prisma/adapter-neon` driver adapter), Cloudflare R2 (S3-compatible), Tailwind, browser-image-compression, nanoid, qrcode, jose. Deploy on Vercel behind Cloudflare DNS.

**Do not add unlisted frameworks or libraries.** The stack is frozen. Password hashing uses Node built-in `node:crypto` scrypt — no bcrypt/argon2.

## Critical Gotchas (easy to miss)

### Database: Two connection strings
- `DATABASE_URL` — Neon pooled (for queries). Use this everywhere.
- `DIRECT_URL` — Neon direct (for `prisma migrate` only). Never use in app code.
- Prisma client in `lib/prisma.ts` as singleton — serverless cold starts will exhaust connections without this.

### Auth: Session-based, two cookie systems
- Student editing = `owk_session` httpOnly JWT cookie (14 days, jose HS256). Issued by `POST /api/auth/login` (username+password).
- Admin = shared password → signed `owk_admin` httpOnly cookie (8 hours). Separate from student session; both systems coexist.
- `editToken` column still exists (NOT NULL @unique), still generated on import, but `/edit/{token}` route is retired. Editing is through `/me` with session cookie.
- Session cookie MUST be server-side `Set-Cookie` (never `document.cookie` or localStorage) — this is critical for Safari ITP survival over 10+ days.
- `ADMIN_PASSWORD` and `SESSION_SECRET` have no hard-coded fallback. Missing auth env vars must fail closed instead of silently signing JWTs with a default secret.
- Password hash uses Node built-in `node:crypto` scrypt + `timingSafeEqual`. Format: `"salt_hex:hash_hex"`.
- Favorites are server-side (Favorite table), one-way (no "who favorited me" reads), no localStorage caching.

### Images: Presigned upload, not server passthrough
1. Frontend compresses with `browser-image-compression` (≤1600px, ≤500KB, webp)
2. Requests presigned PUT URL from `/api/upload-url` (server checks session + image count < 4)
3. PUTs directly to R2 — **never through server**
4. POSTs `/api/me/images` to save the record
5. Avatar uses same flow but stored on `Person.avatarUrl`, not counted toward the 4-image limit
- Persist the exact `key` returned by `/api/upload-url`; never derive it from `publicUrl`. `/api/me/images` validates key ownership and URL equality, then performs the final image-count check inside a Serializable transaction.

### Short codes: shared between pages
The same `Person.code` serves both `/u/{code}` (profile) and `/loc/{code}` (location card). Each person gets one code. Default username = code.

### Validation quirks
- `bio` counted by code points, not characters or bytes — cap at 80.
- Image count must be < 4 **and** verified server-side on both upload-url and image-save endpoints.

### System settings (stored in SystemSetting table, PATCH via `/api/admin/settings`)
- `allowStudentVisibilityControl` is **not implemented**. The simplified model auto-publishes a profile when the student uploads an avatar and saves their profile. There is no student-facing "主页可见" toggle.
- `/api/me` PATCH automatically sets `published = true` when `avatarUrl` is present; the `published` field is ignored if sent by the client.
- Admin can still hide individual pages via the `hidden` flag (takedown).

### States ≠ pages
- `hidden=true` → show "该页面已隐藏" placeholder, not blank screen.
- `published=false` → show "这位同学还没布置主页" placeholder (only when visibility control enabled).
- Both `/u/[code]` and `/loc/[code]` require login (session gate). Unauthenticated users redirect to `/?next=<path>`.

### Build order
For v2.0, follow the 10-step sequence in section 11 of docs/04_开发文档_v2.0_账号系统迁移.md.

## What NOT to build (v2.0 exclusions)
Comments, likes, social links, pairing algorithms, notifications, student self-service password reset.
- Account login and server-side favorites: now built.
- Password reset: admin-only, no student self-service.
- "Who favorited me": never query `favoritesReceived`. It exists for cascade delete only.
- No bcrypt/argon2 — use built-in `node:crypto` scrypt.

## Deployed URL
Production: `https://msoweek.site` (Vercel, auto-deploys from `main` branch).

## Pitfalls

### Prisma v6 config structure
- `prisma.config.ts` is separate from `schema.prisma` — both must be updated.
- Generator uses `provider = "prisma-client"` (not `"prisma-client-js"`).
- Generator output is `../app/generated/prisma` — import from `@/app/generated/prisma/client`.
- `directUrl` goes in `prisma.config.ts`, not in `schema.prisma`.
- `prisma db execute` in v6 needs explicit `--url` flag.

### Prisma v6: driver adapter + no Rust engine (2026-07-02)
1. **`schema.prisma` uses `engineType = "client"`**, with `@prisma/adapter-neon` in `lib/prisma.ts`. There is **no native query engine binary** (`.so.node` / `.dylib.node`) to bundle.
2. **Previous workarounds are no longer required**: `binaryTargets`, `outputFileTracingIncludes`, `vercel.json` `functions.includeFiles`, and `--webpack` for the Prisma engine issue.
3. **`dotenv` must still be in `dependencies`** (not `devDependencies`) — `prisma.config.ts` imports `dotenv/config`.
4. **Generated Prisma client is still committed to git** (`app/generated/prisma/`) for reproducible builds, but it no longer contains engine binaries.

### Historical: Prisma engine binary issues (2026-06-25 → 2026-07-01)
- Earlier deployments used `binaryTargets = ["native", "rhel-openssl-3.0.x"]` and struggled to bundle `libquery_engine-rhel-openssl-3.0.x.so.node` into Vercel functions. This was resolved by switching to `engineType = "client"` with the Neon driver adapter.
- The 4-path cold-start resolution noise and the `PRISMA_QUERY_ENGINE_LIBRARY` workaround are no longer relevant.

### Session cookie: server httpOnly only (2026-06-26)
Session cookie (`owk_session`) must be set via server `Set-Cookie` header, never via `document.cookie` or localStorage. iOS Safari ITP caps script-set cookies to 7 days, but server-set httpOnly cookies are exempt. The app runs for 10+ days and a single login must survive the full event.

### Password: plaintext only at generation (2026-06-26)
Account passwords are 12-char scrypt hashes using `PRINTABLE_PASSWORD_ALPHABET` (mixed case + digits + safe symbols, excluding visually ambiguous chars). The plaintext is returned ONCE during import (`/api/admin/import`) or reset (`/api/admin/reset-password`). Export (`/api/admin/export`) does NOT include passwords. No student self-service password recovery.
- Login route has per-IP and per-username rate limiting to slow online brute-force attempts.
- Admin batch import is transactional: Person and LocationCard rows are created as an all-or-nothing batch, and uniqueness conflicts return 409.

### Favorites: one-way, no reverse reads (2026-06-26)
`Favorite.favoriteeId` and `Person.favoritesReceived` exist ONLY for cascade delete. Never query "who favorited me" — this is a product hard-decision, not a performance optimization.

### System settings gate: silent drop, not reject (2026-06-26)
The original `v2.0` implementation rejected PATCH with 403 when `published` was in the body and the admin setting was OFF. This blocked ALL saves (including non-published edits). **Fix**: when the setting is OFF, the server silently drops `published` from the body. Students can always save; they just can't change visibility.

### Two cookie systems are independent (2026-06-26)
`owk_session` (student, 14d) and `owk_admin` (admin, 8h) share zero code beyond both using jose JWT. Don't merge them or reuse secrets between them.

### Cloudflare / Neon / R2 unaffected by auth changes
The account system migration (v1.0→v2.0) does NOT affect: R2 presigned URL flow, Neon pooled/direct connection strings, Cloudflare DNS, or QR code generation. The only new env var is `SESSION_SECRET`.

### Admin: session check + logout routes (added 2026-06-26)
- `GET /api/admin/session` — returns `{ authed: boolean }`. Admin page mounts with a session check so refresh doesn't force re-login.
- `POST /api/admin/logout` — clears `owk_admin` cookie server-side via `clearAdminCookie()`.
- `clearAdminCookie()` mirrors `clearStudentCookie()` but uses admin's `COOKIE_NAME`.

### Admin: export now includes code (2026-06-26)
- Export CSV header: `chineseName,englishName,username,code,homepage,location`.
- The `code` column enables the "重置" button on each row in the export table — clicking it navigates to the reset-password tab with the code pre-filled via `sessionStorage`.

### handleLogin e.preventDefault() (2026-06-26)
- When refactoring `AdminPage`, do NOT drop `e.preventDefault()` from `handleLogin`. Without it, the form submits as a full page reload, the session cookie isn't set properly, and the user is bounced back to the login screen. This happened once already.

### handleSave PATCH body
- The edit page agent failed to include `avatarUrl` in the PATCH body. When someone uploads an avatar then hits Save, the avatar URL must be sent alongside other fields.

### Save/publish coupling in /api/me PATCH (fixed 2026-06-25)
- **Bug**: `published !== undefined` gate blocked ALL PATCHes when admin toggle was OFF.
- **Fix**: Changed to `published === true`. Use `=== true` when the intent is "only when actively toggling ON".

### R2 lazy initialization
- `S3Client` instantiated at module top-level crashes the entire app if R2 env vars are missing. Use a lazy `getS3()` function.

### @types/qrcode install
- First `npm install -D @types/qrcode` can fail silently. Verify with `ls node_modules/@types/qrcode`.

### Do NOT set PRISMA_QUERY_ENGINE_LIBRARY on Vercel (2026-07-01)
- A stale `PRISMA_QUERY_ENGINE_LIBRARY` env var pointing to a non-resolvable path will crash `prisma generate` during the Vercel build with `provided path [...] can't be resolved`. If it exists, remove it from Vercel project settings. With `engineType = "client"` there is no query engine binary and this env var is unnecessary.
