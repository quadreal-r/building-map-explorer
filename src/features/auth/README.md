# Auth feature

Email/password sign-in via Supabase Auth.

| File | Role |
|------|------|
| `LoginModal.tsx` | Modal form; sign-out when already authenticated |

When `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are unset, the modal explains that the app runs in **static JSON read-only mode**.

Auth state is provided by `AuthProvider` in `src/app/authContext.tsx` and consumed via `useAuth()` / `useAuthContext()`.

Authenticated users can edit polygon vertices (see `usePolygons`) and persist settings to `app_settings`.
