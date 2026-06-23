# Building Map Explorer

QuadReal Industrial Portfolio Map — a strongly typed React SPA for exploring buildings, RTUs, tenants, utilities, and polygons on Google Maps.

**Live site:** https://quadreal-r.github.io/building-map-explorer/

## Stack

- **Frontend:** Vite + React 18 + TypeScript (strict)
- **State:** Zustand (UI/filters) + TanStack Query (data)
- **Database:** Supabase (Postgres + RLS)
- **Map:** Google Maps JavaScript API (vector map)
- **Deploy:** GitHub Actions → GitHub Pages

## Quick start

```bash
git clone git@github.com:quadreal-r/building-map-explorer.git
cd building-map-explorer
npm install
cp .env.example .env.local   # add your keys
npm run dev
```

Open http://localhost:5173/ after `npm run dev`.

Without env vars the app loads bundled JSON from `supabase/data/` (read-only static mode).

## Environment variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (public, RLS-protected) |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps API key (HTTP referrer restricted) |
| `VITE_GOOGLE_MAPS_MAP_ID` | Vector map ID (default: `8e5479ffab76936efa73ede6`) |

Set the same `VITE_*` values as **GitHub repository secrets** for CI deploys.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run test` | Vitest unit tests |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm run extract` | Parse legacy HTML → `supabase/seed.sql` + JSON |
| `node scripts/apply-seed-chunks.mjs` | Split `seed.sql` into MCP-sized chunks under `supabase/.seed-chunks/` |

## Database setup

1. Apply migration: `supabase/migrations/20260620000000_initial_schema.sql` (or Supabase MCP `apply_migration`)
2. Load seed: paste `supabase/seed.sql` into the Supabase SQL editor, or apply chunks from `supabase/.seed-chunks/` (generate with `node scripts/apply-seed-chunks.mjs`)

RLS policy: **public read**, **authenticated write**.

## Project structure

Each folder contains a `README.md` describing coding standards for that layer:

```
src/
  app/          App shell, providers
  components/   Reusable UI (Button, Chip, Modal, …)
  features/     Sidebar, map, cost estimator, auth, settings
  hooks/        Data and filter hooks
  lib/          Pure logic (filters, RTU, cost estimator)
  stores/       Zustand stores
  types/        Domain + database types
  styles/       Legacy CSS (ported from original HTML)
supabase/       Migrations, seed, extracted JSON
scripts/        Data extraction utilities
.github/        CI/CD workflow
```

## Access model

- **Anonymous:** browse map, filters, cost estimator, Excel export
- **Authenticated (Supabase):** edit markers, notes, polygons, import Excel to DB

## Legacy migration

The original single-file app (`building_map_explorer_v2026_06_20_3.html`) is parsed by `scripts/extract.ts` into normalized SQL + JSON snapshots.

## License

Private — QuadReal Property Group.
