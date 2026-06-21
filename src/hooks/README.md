# Hooks

React hooks for data loading, authentication, and derived building lists.

## `usePortfolioData`

Loads portfolio data via React Query. When Supabase env vars are configured, fetches `buildings`, `rtus`, `tenants`, `utilities`, and `polygons` tables. On missing config or fetch errors, falls back to static JSON in `supabase/data/`.

Requires a `QueryClientProvider` in the app root.

## `useAuth`

Tracks Supabase auth session state (`session`, `user`, `isLoading`, `isAuthenticated`) and exposes `signIn` / `signOut`. When Supabase is not configured, returns unauthenticated state without network calls.

## `useFilteredBuildings`

Combines `filterStore` with `@/lib/filters` (`applyPrimaryFilters`, `passDqFilter`, `reconcileFilterDropdowns`):

- `filteredBuildings` — map-visible buildings (search, dropdowns, advanced filters)
- `listBuildings` — sidebar list (adds data-quality chip filters)
- `count` / `mapCount` — result counts

Auto-resets park/cluster/manager dropdowns when the search term no longer matches the current selection (legacy behavior).

```ts
const { data } = usePortfolioData()
const { filteredBuildings, listBuildings, count } = useFilteredBuildings(
  data?.buildings ?? [],
)
```
