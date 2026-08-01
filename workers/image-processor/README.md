# O-Week image processor Worker

Vercel calls this Worker through an HMAC-signed `POST /process` request after validating an upload and moving the Asset to `PROCESSING`. The Worker then:

1. checks object size, declared MIME and magic bytes;
2. decodes and re-encodes the image through the Cloudflare Images binding;
3. caps the canonical image at 1600 px and generates a 480 px WebP thumbnail;
4. writes metadata-stripped bytes under `processed/` and removes the original from `incoming/`;
5. calls the signed Vercel callback, which re-downloads and verifies the exact bytes before marking the Asset `READY`.

The same Worker serves processed objects through `/assets/*`; the bucket itself stays private. The Cache API absorbs repeated public reads before they reach R2. Processed metadata makes repeated signed requests idempotent.

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

`ASSET_PROCESSOR_SECRET` must be the exact same value as the Vercel production variable of the same name. Never put it in `wrangler.jsonc`, `.dev.vars`, Git, screenshots, or chat.

Paste `cors-policy.json` into R2 bucket Settings > CORS Policy. The origin intentionally allows only `https://oweek-wp-a-2.vercel.app`. Keep public bucket access disabled; set `R2_PUBLIC_BASE_URL` in Vercel to `https://oweek-wp-a-2.vercel.app/r2-assets`. Next.js rewrites that stable same-origin path to the Worker, avoiding direct `workers.dev` access from student devices.

R2 Event Notifications are intentionally not used because Cloudflare currently requires Workers Paid for that integration. Set `ASSET_PROCESSOR_URL` in Vercel to the Worker URL without `/assets`.
