# `src/lib`

Pure TypeScript utilities ported from the legacy single-file app. No React imports here.

## Standards

- **Strict typing** — no `any`; prefer explicit return types on exported functions.
- **Side-effect free** — DOM, Supabase, and Google Maps live elsewhere; `lib/` is unit-testable logic.
- **Legacy parity** — filtering, RTU age, data-quality checks, and the replacement-cost estimator match the behavior in `building_map_explorer_v2026_06_20_3.html`.
- **Imports** — use `@/` path aliases (`@/lib/rtu`, `@/types/domain`).
- **Tests** — colocate as `*.test.ts` beside the module under test; sample data may import JSON snapshots from `supabase/data/`.

## Modules

| File | Purpose |
|------|---------|
| `constants.ts` | Park/layer colors, GPS placeholder, RTU age thresholds, imagery modes |
| `colors.ts` | `getColor(park)` |
| `rtu.ts` | RTU year/age/tonnage helpers |
| `dataQuality.ts` | Placeholder GPS, missing lamicoid, vacant tenant checks |
| `filters.ts` | Search, dropdown, advanced, and DQ filter pipeline |
| `costEstimator.ts` | RTU replacement cost compute + projection |
| `costEstimator.pricing.ts` | Static `RTU_PRICING` table from Capital workbook |
| `format.ts` | Locale formatting helpers |
| `env.ts` | Validated `VITE_*` environment variables |
