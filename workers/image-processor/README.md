# O-Week image processor Worker

Vercel calls this Worker through an HMAC-signed `POST /process` request after validating an upload and moving the Asset to `PROCESSING`. The Worker then:

1. checks object size, declared MIME and magic bytes;
2. decodes and re-encodes the image through the Cloudflare Images binding;
3. caps the canonical image at 1600 px and generates a 480 px WebP thumbnail;
4. writes metadata-stripped bytes under `processed/` and removes the original from `incoming/`;
5. calls the signed Vercel callback, which re-downloads and verifies the exact bytes before marking the Asset `READY`.

The same Worker serves processed objects through `/assets/*`; the bucket itself stays private. Before every object read, the Worker forwards the browser session cookie in an HMAC-signed request to `/api/internal/assets/authorize`. The application rechecks the current session, event, submission state, group scope, public address, and visibility settings. Only `processed/` and `_derived/processed/` keys are eligible, and responses use `private, no-store` instead of shared immutable caching. Processed metadata makes repeated signed processing requests idempotent.

The application accepts at most 512 KiB per upload and 2,250 Asset records globally. The Worker rejects canonical output above 1 MiB and thumbnails above 256 KiB. These are deliberate free-tier safety limits.

## Resource names

- R2 bucket: `oweek-images`
- Worker: `oweek-image-processor`

## Deploy

Run from this directory after signing in with Wrangler:

```bash
npx wrangler@latest secret put ASSET_PROCESSOR_SECRET
npx wrangler@latest deploy
```

`ASSET_PROCESSOR_SECRET` must be the exact same value as the Vercel production variable of the same name. It authenticates processing callbacks and the Worker-to-application media authorization request. Never put it in `wrangler.jsonc`, `.dev.vars`, Git, screenshots, or chat.

`cors-policy.json` is the dashboard-compatible R2 CORS policy. `cors-policy.wrangler.json` is the equivalent Wrangler CLI input and can be applied with:

```bash
npx wrangler@latest r2 bucket cors set oweek-images --file cors-policy.wrangler.json
```

The production origin is `https://msoweek.site`; the legacy `www` hostname and fixed Vercel alias remain explicitly allowed only for redirects and operational fallback. Do not replace this list with a wildcard. Keep public bucket access disabled; set `R2_PUBLIC_BASE_URL` in Vercel to `https://msoweek.site/r2-assets`. Next.js rewrites that same-origin path to the Worker so the session cookie can be forwarded for per-request authorization; direct `workers.dev` asset requests fail closed without the application session.

R2 Event Notifications are intentionally not used because Cloudflare currently requires Workers Paid for that integration. Set `ASSET_PROCESSOR_URL` in Vercel to the Worker URL without `/assets`.
