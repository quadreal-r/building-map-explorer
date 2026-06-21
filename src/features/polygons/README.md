# Polygons

Google Maps polygon overlays for unit boundaries.

## Standards

- Domain type: `Polygon` in `types/domain.ts`.
- Render via `usePolygons` hook; editable/draggable when authenticated.
- Right-click polygon to delete (auth required); edits persist via `portfolioApi.upsertPolygon`.
- Colors default to `#60a5fa`; stored in Supabase `polygons.paths` as JSONB.

## Hooks

- `usePolygons.ts` — mount/update overlays on the map instance.
