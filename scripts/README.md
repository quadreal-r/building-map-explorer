# Scripts

One-off utilities for migrating data from the legacy single-file HTML app.

## Standards

- Scripts are **Node/TSX**, run via `npm run <script>`.
- Output goes to `supabase/data/` (JSON) and `supabase/seed.sql` (SQL).
- Do not commit generated seed if it contains sensitive data (this project uses public portfolio data).

## extract.ts

Parses `BUILDINGS`, `UTILITIES`, and `POLYGONS` arrays from the legacy HTML:

```bash
npm run extract
npm run extract -- "C:\path\to\legacy.html"
```

## extract-css.mjs

Extracts the app stylesheet block into `src/styles/legacy.css`.

## RTU pictures on Cloudflare R2

- `upload-rtu-pictures-r2.mjs` — upload images from `public/database/rtu-pictures/` to R2; warns when EXIF GPS is >100 ft from the linked RTU marker.
- `lib/rtu-gps-validate.mjs` — shared GPS distance helpers for upload/audit scripts.
- `apply-deploy-bundle.mjs` — when R2 env vars are set, uploads bundle pictures to R2 instead of writing large files into `public/`.
- Shared client: `lib/r2-client.mjs` (S3-compatible API).
