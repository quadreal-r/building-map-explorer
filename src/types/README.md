# `src/types`

Shared TypeScript types for the Building Map Explorer app.

## Standards

- **`domain.ts`** — application-facing shapes used by React features, Zustand stores, and `src/lib` helpers. Includes normalizers from legacy JSON (`desc` → `description`).
- **`database.types.ts`** — Supabase table Row/Insert/Update types matching `supabase/migrations/20260620000000_initial_schema.sql`. Regenerate when the schema changes (`supabase gen types typescript`).
- **No runtime code in `database.types.ts`** — types only.
- **Strict nullability** — mirror Postgres nullability in DB types; domain types may use optional fields for nested relations loaded at runtime.

## Key domain types

- `Building`, `Rtu`, `Tenant`, `Utility`, `Polygon`
- `FilterState`, `AdvFilterState`, `DqFilterState`
- `LayerKey`, `UtilityType`, `CostBasis`, `ImageryModeId`
- `Legacy*Json` + `normalizeLegacy*` helpers for seed JSON under `supabase/data/`
