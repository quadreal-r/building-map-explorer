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
