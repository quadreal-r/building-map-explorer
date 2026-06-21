# App shell

Root layout and providers for the React app.

| File | Role |
|------|------|
| `AppShell.tsx` | Sidebar + map column + cost banner + modals |
| `providers.tsx` | `QueryClientProvider` + `AuthProvider` |
| `authContext.tsx` | Supabase session context |

## Data loading

`usePortfolioData` loads from Supabase when env is configured; otherwise (or on fetch error) it falls back to bundled JSON under `supabase/data/`.

Excel import updates local state and the React Query cache (`portfolio` key).

## GitHub Pages / SPA routing

For client-side routing on GitHub Pages, the build copies `index.html` to `404.html` (see `.github/workflows/deploy.yml`). `public/404.html` includes a redirect script for direct URL hits during local preview of that pattern.

## Entry

`src/main.tsx` mounts `<Providers><App /></Providers>` and imports `src/styles/legacy.css`.
