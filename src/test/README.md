# `src/test`

Vitest configuration and shared test setup.

## Standards

- **Runner** — Vitest with `jsdom` environment (see root `vitest.config.ts`).
- **Setup** — `setup.ts` imports `@testing-library/jest-dom/vitest` for DOM matchers.
- **Location** — global setup lives here; unit tests colocate with source in `src/lib/*.test.ts`.
- **Data** — import static fixtures from `supabase/data/*.json` when integration-style coverage is useful; prefer small inline fixtures for edge cases.
- **Env** — call `resetEnvCache()` from `@/lib/env` when tests mutate `import.meta.env`.

## Commands

```bash
npm test          # vitest run
npm run test:watch
npm run test:coverage
```
