# Supabase

Database schema, migrations, and seed data for Building Map Explorer.

## Setup

1. Link project: `https://wyiymdtlncperqpwriuk.supabase.co`
2. Run migration: `migrations/20260620000000_initial_schema.sql`
3. Load seed: `seed.sql` (regenerate with `npm run extract`)

## RLS

| Role | SELECT | INSERT/UPDATE/DELETE |
|------|--------|----------------------|
| anon | yes | no |
| authenticated | yes | yes |

## Tables

- `buildings`, `rtus`, `tenants`, `utilities`, `polygons`, `app_settings`

## data/

JSON snapshots extracted from legacy HTML — used as static fallback when Supabase env is unset.
