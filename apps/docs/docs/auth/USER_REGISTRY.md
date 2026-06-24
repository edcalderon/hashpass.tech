# Canonical User Registry (`public.user`)

## Why It Exists

HashPass supports multiple auth providers (Supabase email/OTP, Google OAuth via Directus, Google SDK on Android, Better Auth for event tenants, Ethereum/Solana wallets). Each provider owns its own internal user table, but none of them are the app's source of truth.

`public.user` is the **provider-agnostic source of truth** for every account in the system. It removes vendor lock-in to Supabase `auth.users` and gives us a single place to look up any user regardless of how they authenticated.

> **Naming note:** The table follows the SQL singular-noun convention (`user`, not `users`).
> Better Auth's internal user table is named `ba_users` (separate, `ba_` prefix) to avoid a
> naming conflict. `public.user` is the app-level canonical registry; `ba_users` is an
> auth-provider implementation detail.

## Table Schema

```sql
CREATE TABLE public."user" (
  id                 uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email              text        UNIQUE NOT NULL,       -- deduplication key

  provider           text        NOT NULL DEFAULT 'email',
  auth_provider      text        NOT NULL DEFAULT 'email',
  auth_user_id       text,                              -- provider-specific UUID

  first_name         text,
  last_name          text,
  full_name          text,
  avatar_url         text,
  phone              text,

  role               text        NOT NULL DEFAULT 'user',
  status             text        NOT NULL DEFAULT 'active', -- active | disabled | deleted

  email_verified_at  timestamptz,
  last_sign_in_at    timestamptz,
  deleted_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  auth_metadata      jsonb       NOT NULL DEFAULT '{}',
  profile_metadata   jsonb       NOT NULL DEFAULT '{}',

  -- Map of every provider that has authenticated this email
  -- e.g. {"supabase": "<uuid>", "directus": "<uuid>", "google": "<sub>", "better-auth": "<id>"}
  provider_ids       jsonb       NOT NULL DEFAULT '{}'
);
```

## Related Table FK Constraints (added V006)

All `user_*` tables now have explicit FK constraints enforcing that `user_id` values
reference real authenticated users in `auth.users`:

| Table | Column | FK target |
|-------|--------|-----------|
| `user_profiles` | `user_id uuid` | `auth.users(id) ON DELETE CASCADE` |
| `user_balances` | `user_id uuid` | `auth.users(id) ON DELETE CASCADE` |
| `user_roles` | `user_id uuid` | `auth.users(id) ON DELETE CASCADE` |
| `user_transactions` | `user_id uuid` | `auth.users(id) ON DELETE CASCADE` |
| `user_blocks` | `blocker_id uuid` | `auth.users(id) ON DELETE CASCADE` |
| `user_blocks` | `blocked_id uuid` | `auth.users(id) ON DELETE CASCADE` |

`user_profiles.user_id` was also fixed from `text` → `uuid` in V006 for type consistency.

## How Users Get Replicated

### Path 1 — Supabase trigger (automatic)

Any `INSERT` or `UPDATE` on `auth.users` fires `on_auth_user_sync` → `sync_auth_user_to_public_users()` → `upsert_public_user_registry()`.

This covers:
- OTP sign-in
- Magic link sign-in
- Google native SDK sign-in (Android)
- Any future Supabase-native provider

### Path 2 — API call after auth (explicit)

Every server-side auth route calls `syncPublicUserRegistry(request, input)` from `lib/auth/public-user-registry.ts` after a successful authentication. This covers:
- `POST /api/auth/otp/verify` — OTP verification
- `GET /api/auth/oauth/google` — Directus Google OAuth callback
- `POST /api/auth/oauth/callback` — legacy OAuth callback
- `POST /api/auth/wallet/ethereum` — Ethereum wallet auth
- `POST /api/auth/wallet/solana` — Solana wallet auth
- Better Auth Google callback (`lib/server/better-auth.ts` `databaseHooks.user.*`)

Both paths call the same `upsert_public_user_registry` Postgres function so the write is always idempotent.

### Path 3 — Backfill (migration)

`db/migrations/V004__users_canonical_table.sql` includes a `DO $$ ... $$` block that iterates all existing `auth.users` and backfills them into `public.user` on first run. Safe to re-run (idempotent upserts).

`db/migrations/V005__rename_user_tables.sql` includes a second backfill block for Better Auth users (`ba_users`), since they have no Supabase auth record.

## upsert_public_user_registry Function

```sql
SELECT public.upsert_public_user_registry(
  '{"provider":"google","auth_user_id":"<uuid>","email":"user@example.com",...}'::jsonb
);
-- Returns: {"id": "<public.user uuid>"}
```

Merge semantics:
- `email` is the conflict key — one row per email address
- `provider_ids` is **merged** (existing keys preserved, new keys added)
- `role` is only upgraded, never downgraded (e.g. `admin` survives a subsequent `user` login)
- `status` is sticky at `deleted` once set (prevents resurrection without an explicit admin action)
- `auth_metadata` and `profile_metadata` are shallow-merged with `||`
- All other fields use `COALESCE(incoming, existing)` — never blank out a value that was already set

## Deletion

`DELETE /api/auth/delete-account`:

1. Cleans all data tables (passes, user_profiles, etc.) by `user_id`
2. Deletes `public.user` row by email
3. Calls `auth.admin.deleteUser(supabaseUUID)` to remove from Supabase auth
4. The `on_auth_user_deleted` trigger also soft-deletes `public.user` as a safety net

## Switching or Migrating Auth Providers

Because every user is already in `public.user` with `provider_ids` tracking all their provider UUIDs, you can:

1. Add a new provider — new sign-ins will set `provider` and add a key to `provider_ids`
2. Remove Supabase — replace `upsert_public_user_registry` calls with direct inserts; `public.user` already holds everything you need
3. Query users without Supabase — `SELECT * FROM public."user"` has no Supabase dependency
4. Migrate to a new auth provider — seed it from `public.user` (email + profile fields + provider_ids)

## DB Table Naming Convention

| Table | Notes |
|-------|-------|
| `public.user` | Canonical registry — singular noun per SQL standard |
| `ba_users` | Better Auth internal store — `ba_` prefix, NOT a canonical table |
| `user_profiles` | Extension of `auth.users` via FK — `user_` namespace prefix |
| `user_balances` | Extension of `auth.users` via FK — `user_` namespace prefix |
| `user_roles` | Extension of `auth.users` via FK — `user_` namespace prefix |
| `user_transactions` | Extension of `auth.users` via FK — `user_` namespace prefix |
| `user_blocks` | Extension of `auth.users` via FK — `user_` namespace prefix |

## Migration History

| Migration | Description |
|-----------|-------------|
| `V004__users_canonical_table.sql` | Created `public.users` (since renamed), `upsert_public_user_registry()`, auth.users sync triggers, initial auth.users backfill |
| `V005__rename_user_tables.sql` | Renamed Better Auth `user` → `ba_users`; updated `account`/`session` FKs; backfilled `ba_users` into canonical registry |
| `V006__rename_users_singular_add_fks.sql` | Renamed `public.users` → `public.user` (SQL singular standard); added FK constraints from all `user_*` tables → `auth.users(id)` ON DELETE CASCADE; fixed `user_profiles.user_id` text → uuid |

## Relevant Files

| File | Purpose |
|------|---------|
| `db/migrations/V004__users_canonical_table.sql` | Table creation, function, triggers, backfill |
| `db/migrations/V005__rename_user_tables.sql` | ba_users rename + Better Auth backfill |
| `db/migrations/V006__rename_users_singular_add_fks.sql` | Singular rename + FK constraints on user_* tables |
| `apps/mobile-app/lib/auth/public-user-registry.ts` | `syncPublicUserRegistry()` — TypeScript API |
| `apps/mobile-app/lib/server/better-auth.ts` | Syncs Better Auth users via `databaseHooks`; uses `modelName: 'ba_users'` |
| `apps/mobile-app/app/api/auth/otp/verify+api.ts` | Calls sync after OTP auth |
| `apps/mobile-app/app/api/auth/oauth/google+api.ts` | Calls sync after Google OAuth |
| `apps/mobile-app/app/api/auth/oauth/callback+api.ts` | Calls sync after OAuth callback |
| `apps/mobile-app/app/api/auth/delete-account+api.ts` | Deletes from `public.user` on account deletion |

## Applying the Migrations

```bash
# Apply all migrations in order against the target project
# CONN = your Supabase pooler connection string from .env.production
psql "$CONN" -f db/migrations/V004__users_canonical_table.sql
psql "$CONN" -f db/migrations/V005__rename_user_tables.sql
psql "$CONN" -f db/migrations/V006__rename_users_singular_add_fks.sql
```

After running, verify:
```sql
-- Canonical table exists with data
SELECT count(*) FROM public."user";
SELECT email, provider, provider_ids FROM public."user" LIMIT 10;

-- FK constraints in place
SELECT tc.table_name, tc.constraint_name, ccu.table_name AS ref_table
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('user_profiles','user_balances','user_roles','user_transactions','user_blocks')
ORDER BY tc.table_name;
```
