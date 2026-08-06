---
title: Supabase project map (core vs BSL, dev vs prod)
---

# Supabase project map

This repo talks to **three** physical Supabase projects, not two, and the
`.env` variable names alone don't make that obvious -- several names are
ambiguous between profiles by design (fallback chains), which has caused
real confusion more than once. This is the authoritative mapping. If a
value in `.env` disagrees with this table, the table is right and `.env`
needs fixing, not the other way around.

## The three projects

| Project ref | Used as | Notes |
|---|---|---|
| `fxgftanraszjjyeidvia` | **core production** (`hashpass.tech`) only | Never used for dev, never used for BSL. |
| `mnnqryrdlhddorqsrtbn` | **BSL production** (`bsl.hashpass.tech`) only | Never used for dev, never used for core. |
| `gsugeqozyeokncpbndna` | **shared dev** for both core and BSL | Deliberate, added 2026-08-06. `core-development` and `bsl-development` both point here. This is the *only* place core and BSL intentionally share a database. |

If you ever see `fxgftanraszjjyeidvia` or `mnnqryrdlhddorqsrtbn` referenced
from a `*_DEV` variable, or `gsugeqozyeokncpbndna` referenced from a
`*_PROD` variable, that's a bug -- check this table and fix it.

## How resolution actually works

`apps/mobile-app/config/supabase-profiles.ts` defines four profiles
(`core-development`, `core-production`, `bsl-development`, `bsl-production`),
each resolved by request hostname. Each profile has its own **priority
list** of env var names it checks in order -- the first one that's set
wins. This is why the same physical value can validly appear under several
different names in `.env`: it's not always duplication, it's satisfying
multiple profiles' priority chains on purpose.

### `core-development`
- URL: `EXPO_PUBLIC_SUPABASE_URL_DEV` → `EXPO_PUBLIC_SUPABASE_URL` (prod fallback -- don't rely on this, always set the DEV one)
- Service role: `SUPABASE_SERVICE_ROLE_KEY_DEV` → `SUPABASE_SERVICE_ROLE_KEY`
- DB URL: `SUPABASE_DB_URL_DEV` → `DATABASE_URL_DEV` → `DEV_DB_URL`
- **Project: `gsugeqozyeokncpbndna`**

### `bsl-development`
- URL: `EXPO_PUBLIC_BSL_SUPABASE_URL_DEV` (checked first) → several fallbacks, eventually down to the *unprefixed* `EXPO_PUBLIC_SUPABASE_URL_DEV`
- Service role: `BSL_SUPABASE_SERVICE_ROLE_KEY_DEV` (checked first) → ... → unprefixed `SUPABASE_SERVICE_ROLE_KEY_DEV` (last fallback)
- DB URL: `BSL_SUPABASE_DB_URL_DEV` (checked first) → `SUPABASE_DB_URL_BSL_DEV` → `DATABASE_URL_BSL_DEV` → `DEV_BSL_DB_URL` (does **not** fall back to the unprefixed name)
- **Project: `gsugeqozyeokncpbndna`** (same as core-development, by design)

Because `bsl-development` checks the `BSL_`-prefixed names *first*, setting
those explicitly (as this repo's `.env` now does) means bsl-development
never actually depends on the unprefixed fallback chain, even though it
exists. Set both explicitly anyway -- don't rely on the fallback silently
doing the right thing.

### `core-production`
- URL: `EXPO_PUBLIC_SUPABASE_URL_PROD` → `EXPO_PUBLIC_SUPABASE_URL`
- Service role: `SUPABASE_SERVICE_ROLE_KEY_PROD` → `SUPABASE_SERVICE_ROLE_KEY` → (BSL fallbacks, compatibility-only, should never actually be hit)
- DB URL: `SUPABASE_DB_URL_PROD` → `DATABASE_URL_PROD` → `PROD_DB_URL`
- **Project: `fxgftanraszjjyeidvia`**

### `bsl-production`
- URL: `EXPO_PUBLIC_BSL_SUPABASE_URL_PROD` (checked first) → fallbacks
- Service role: `BSL_SUPABASE_SERVICE_ROLE_KEY_PROD` (checked first) → fallbacks
- DB URL: `BSL_SUPABASE_DB_URL_PROD` (checked first) → fallbacks
- **Project: `mnnqryrdlhddorqsrtbn`**

## Known unresolved issue (as of 2026-08-06)

Local `.env`'s bare `SUPABASE_DB_URL_PROD` -- which `core-production`'s
profile reads as its *own* primary DB URL -- is currently set to BSL's
connection string (`mnnqryrdlhddorqsrtbn`), not core's own
(`fxgftanraszjjyeidvia`). This was inherited from an earlier session that
noted "SUPABASE_DB_URL_PROD and BSL_SUPABASE_DB_URL_PROD resolve to the
identical physical project" as if that were expected -- it isn't; per this
table they should point at two different projects. Not fixed here because
the only core-prod credential available locally (`DB_HOST`/`DB_USER`/
`DB_PASSWORD`, the pre-existing non-`_PROD`-suffixed set) fails password
auth (confirmed via a direct connection attempt, not assumed). Whoever
fixes this needs a working service-role/DB credential for
`fxgftanraszjjyeidvia` from the Supabase dashboard first. Until fixed,
avoid relying on `SUPABASE_DB_URL_PROD` for anything core-scoped --
`EXPO_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (the REST/PostgREST
path, not a raw DB URL) reliably resolve to the correct core project and
should be preferred for any core-production server-side Supabase client
construction.

## Practical checklist before touching `.env`

1. Figure out which of the four profiles you're actually changing.
2. Look up that profile's priority list above.
3. Set the **first** name in that list explicitly -- don't rely on a
   fallback further down the chain even if it happens to already have the
   right value; a later cleanup of the fallback will silently break you.
4. Verify empirically, don't assume:
   ```bash
   set -a; source .env; set +a
   psql "$THE_VAR_YOU_JUST_SET" -c "select current_database();"
   ```
   Match the returned project against this doc's table, not against what
   you expect it to say.
5. If a name is ambiguous between two profiles (the unprefixed
   `SUPABASE_DB_URL_DEV` and `SUPABASE_SERVICE_ROLE_KEY_DEV` are the current
   example -- `core-development` reads them as primary, `bsl-development`
   reads them only as a last-resort fallback), changing that value affects
   **both** profiles. Prefer setting the profile-specific `BSL_`-prefixed
   name instead of relying on the shared unprefixed one, even when the
   values happen to currently be identical.
