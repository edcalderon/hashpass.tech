# Canonical User Registry (`public.users`)

## Why It Exists

HashPass supports multiple auth providers (Supabase email/OTP, Google OAuth via Directus, Google SDK on Android, Better Auth for event tenants, Ethereum/Solana wallets). Each provider owns its own internal user table, but none of them are the app's source of truth.

`public.users` is the **provider-agnostic source of truth** for every account in the system. It removes vendor lock-in to Supabase `auth.users` and gives us a single place to look up any user regardless of how they authenticated.

## Table Schema

```sql
CREATE TABLE public.users (
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
  -- e.g. {"supabase": "<uuid>", "directus": "<uuid>", "google": "<sub>"}
  provider_ids       jsonb       NOT NULL DEFAULT '{}'
);
```

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
- Better Auth Google callback (`lib/server/better-auth.ts`)

Both paths call the same `upsert_public_user_registry` Postgres function so the write is always idempotent.

### Path 3 — Backfill (migration)

`db/migrations/V004__users_canonical_table.sql` includes a `DO $$ ... $$` block that iterates all existing `auth.users` and backfills them into `public.users` on first run. Safe to re-run (idempotent upserts).

## upsert_public_user_registry Function

```sql
SELECT public.upsert_public_user_registry(
  '{"provider":"google","auth_user_id":"<uuid>","email":"user@example.com",...}'::jsonb
);
-- Returns: {"id": "<public.users uuid>"}
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
2. Deletes `public.users` row by email
3. Calls `auth.admin.deleteUser(supabaseUUID)` to remove from Supabase auth
4. The `on_auth_user_deleted` trigger also soft-deletes `public.users` as a safety net

## Switching or Migrating Auth Providers

Because every user is already in `public.users` with `provider_ids` tracking all their provider UUIDs, you can:

1. Add a new provider — new sign-ins will set `provider` and add a key to `provider_ids`
2. Remove Supabase — replace `upsert_public_user_registry` calls with direct inserts; `public.users` already holds everything you need
3. Query users without Supabase — `SELECT * FROM public.users` has no Supabase dependency
4. Migrate to a new auth provider — seed it from `public.users` (email + profile fields + provider_ids)

## Relevant Files

| File | Purpose |
|------|---------|
| `db/migrations/V004__users_canonical_table.sql` | Table, function, triggers, backfill |
| `apps/mobile-app/lib/auth/public-user-registry.ts` | `syncPublicUserRegistry()` — TypeScript API |
| `apps/mobile-app/app/api/auth/otp/verify+api.ts` | Calls sync after OTP auth |
| `apps/mobile-app/app/api/auth/oauth/google+api.ts` | Calls sync after Google OAuth |
| `apps/mobile-app/app/api/auth/oauth/callback+api.ts` | Calls sync after OAuth callback |
| `apps/mobile-app/lib/server/better-auth.ts` | Calls sync after Better Auth |
| `apps/mobile-app/app/api/auth/delete-account+api.ts` | Deletes from `public.users` on account deletion |

## Applying the Migration

Run against the Supabase project using the Supabase SQL editor or Flyway:

```bash
# Flyway (configured in db/flyway.conf)
flyway migrate

# Or paste db/migrations/V004__users_canonical_table.sql directly into
# Supabase Dashboard → SQL Editor → Run
```

After running, verify:
```sql
SELECT count(*) FROM public.users;
-- Should match auth.users count
SELECT email, provider, provider_ids FROM public.users LIMIT 10;
```
