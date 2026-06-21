# Import / Export

Excel round-trip for portfolio data using SheetJS (`xlsx`).

## Standards

- Sheet names: `Buildings`, `RTUs`, `Tenants`, `Polygons`, `Utilities` (legacy-compatible).
- Import normalizes rows via `types/domain` helpers.
- When signed in and Supabase is configured, import calls `lib/portfolioApi.importPortfolioToSupabase`.
- Export is always client-side download; no auth required.

## Components

- `ImportExportButtons.tsx` — used in map top bar and settings modal.
