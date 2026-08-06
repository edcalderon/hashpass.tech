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

## Migration bootstrap findings (2026-08-06)

Bootstrapping the brand-new `gsugeqozyeokncpbndna` dev project from a
completely blank database (zero tables) surfaced that **`db/migrations/` was
never actually a complete, from-scratch-runnable history** -- both live
databases (BSL prod, and presumably core prod) accumulated real schema
through a mix of tracked migrations *and* untracked, ad hoc DDL applied
directly, going all the way back to the Better Auth tables themselves. This
had never been noticed before because no one had bootstrapped a truly empty
project until now.

Concretely, running V001 through V062 in order against the blank dev project
failed repeatedly and required:

1. **`db/migrations/V000__better_auth_bootstrap_tables.sql` (new file)** --
   Better Auth's own `user`/`account`/`session`/`verification` tables (which
   V005 renames `user` → `ba_users`) were never captured as a SQL migration
   at all; they're normally created by Better Auth's own schema-push
   tooling, run once, out of band. Also includes `touch_updated_at()` and
   `update_updated_at()`, two trigger helper functions referenced by several
   migrations (V002, V007, ...) but never themselves defined in
   `db/migrations`. All four table shapes and both functions were copied
   verbatim from live BSL prod via `pg_get_functiondef`/`\d` (the only place
   this schema is known-correct), so a fresh bootstrap now matches
   production exactly instead of guessing.
2. **`db/migrations/V002__meeting_requests_system.sql` fixed** -- had an
   invalid `CONSTRAINT ... UNIQUE (...) WHERE ...` inside a `CREATE TABLE`
   (not valid Postgres syntax for a table-level constraint; partial
   uniqueness requires a separate `CREATE UNIQUE INDEX ... WHERE ...`),
   plus several non-idempotent `CREATE INDEX`/`CREATE TYPE` statements. Live
   databases were never actually affected by the constraint bug specifically
   (a later migration replaces that unique index with a better one), but the
   file itself could never have run start-to-finish on a blank database
   before this fix.
3. **Remaining schema gap closed via a real schema dump, not more guessing**
   -- after V000-V009, the gap between `db/migrations` and BSL prod's actual
   live schema (dozens of tables: `events`, `event_pass_tiers`,
   `meeting_slots`, `speakers`, `support_*`, `notifications`,
   `pass_claim_codes`, etc. -- all real, all missing from the migration
   history) was clearly too large to keep tracking down file-by-file.
   Instead: `pg_dump --schema-only` of BSL prod (via a `postgres:17-alpine`
   Docker container, since this machine's native `pg_dump` is v16 and
   Supabase runs Postgres 17), filtered to drop the legacy `directus_*`
   tables (archived, no longer needed -- auth now runs on Supabase OTP/email
   plus Better Auth for Google; Directus is unreachable and out of scope),
   applied directly to the dev project. Zero errors. Then all of V001-V062
   were re-run in sequence on top of that (tolerating "already exists" on
   DDL that the schema dump already created) specifically to pick up seed
   data / RPC-only statements the schema-only dump doesn't carry --
   confirmed by `events`/`event_pass_tiers` row counts matching BSL prod
   exactly (5 and 15 rows) afterward.

**Net result:** `gsugeqozyeokncpbndna` now has the full BSL-prod-equivalent
schema (89 tables → 59 non-Directus, all present) plus core's own V004+
canonical-registry additions, all 62 migrations + the new V000 tracked in
its own `hashpass_schema_migrations`, and matching seed data. This is now a
genuinely valid target for local/CI development against either tenant.

**BSL prod (`mnnqryrdlhddorqsrtbn`) migration tracking was found stale, not
its schema** -- `hashpass_schema_migrations` was missing bookkeeping rows
for V004-V007 and V012-V016, V022, V023 even though every object those
files create was independently confirmed live (`upsert_public_user_registry`,
`event_roles`, `user_roles`, `ba_users`, `user_tutorial_progress`,
`reward_transactions`). Also has two rows for a `V004`/`V005` naming
convention (`V004__wallet_auth`, `V005__otp_codes`) that predates the current
file names, and a duplicate-content row (`V052__e2e_encrypted_persistent_meeting_chat`
alongside the current `V053__...`). Bookkeeping-only `INSERT`s to correct
this were prepared but require a human to run them (see git/session history
if picking this back up -- they do not alter schema or data, only tracking
rows) since direct writes to a production database are intentionally outside
this agent's own write path.

**Core prod (`fxgftanraszjjyeidvia`) could not be verified at all this
pass** -- both the direct DB credential (`DB_HOST`/`DB_USER`/`DB_PASSWORD`)
and the service-role REST key (`SUPABASE_SERVICE_ROLE_KEY_PROD`) fail auth
against the real core project. This is the same credential gap already
called out below, now confirmed from two independent paths (DB and REST),
not just one. A fresh credential from the Supabase dashboard is required
before core prod's migration state can be checked at all.

## `tenants.json` was enforcing the wrong refs (fixed 2026-08-06)

Flagged by an automated PR review after this doc was first written: this map
is descriptive, but `packages/tools/scripts/config/tenants.json` is what
`propagate-env.js`/`sync-env.js` actually **enforce** at runtime via
`resolveTenant()` -- both scripts decode the JWT in
`SUPABASE_SERVICE_ROLE_KEY`/`EXPO_PUBLIC_SUPABASE_KEY` and hard-fail if its
`ref` claim doesn't match `tenants.json`'s `supabaseRefs[environment]` for
that tenant. The file had fallen out of sync with reality on every axis:

- `core.supabaseRefs.production` was `mnnqryrdlhddorqsrtbn` (BSL's ref) --
  should be `fxgftanraszjjyeidvia`. This is almost certainly the root cause
  of the previously-unresolved "prod Supabase key invalid, breaks
  OTP/magic-link" issue: `validateSupabaseServiceRoleKey()` in
  `propagate-env.js` would have *rejected* the correct core key and only
  accepted a BSL-ref key as valid for core production, for anyone who ran
  `env:propagate production` while this was wrong. Confirmed independently
  the same day: the actually-deployed `hashpass-prod-expo-router-api`
  Lambda's live `SUPABASE_SERVICE_ROLE_KEY` env var decodes to BSL's ref,
  not core's own.
- `core.supabaseRefs.development`, `bsl.supabaseRefs.development`, and
  `blockchainsummit.supabaseRefs.development` were all still
  `fxgftanraszjjyeidvia` (the old core-only dev project) instead of the new
  shared dev project `gsugeqozyeokncpbndna` -- so setting the new shared-dev
  credentials in `.env` (as this doc's own "Shared dev database" section
  now instructs) would have made the propagation tooling reject them.
- `defaults.supabaseRefs.development` had the same stale value.

All four corrected; `node -e "require('./packages/tools/scripts/lib/tenant-config.js').resolveTenant(...)"`
now returns `gsugeqozyeokncpbndna` for every `*-development` pair and the
correct per-tenant prod ref for every `*-production` pair, verified
directly. `packages/tools/scripts/config/database-profiles.json` was
checked too and does **not** have this class of bug -- it only stores env
var *names* to check in priority order, never a hardcoded ref to compare
against, so there was nothing to drift.

Note on exposing project refs in docs: an automated reviewer also suggested
obfuscating these ids since they're sensitive-adjacent. They're intentionally
left in full here -- this doc's entire value is being the unambiguous,
greppable source of truth for exactly this class of mismatch, and the refs
already appear in full throughout this repo's own `.env`, CLAUDE.md, and git
history, so partial redaction here would create a false sense of protection
without actually limiting exposure.

## Resolved: core prod credential (fixed 2026-08-06)

The issue previously documented here is fixed. A working core-prod DB
credential was obtained; local `.env`'s `SUPABASE_DB_URL_PROD` now correctly
points at `fxgftanraszjjyeidvia` (verified via a live connection, not
assumed), and a stale duplicate `SUPABASE_DB_URL_PROD`/`DATABASE_URL_PROD`
pair further down the file (holding BSL's connection string, which was
silently winning via bash's last-definition-wins `source` behavior) was
removed. `SUPABASE_SERVICE_ROLE_KEY_PROD` had the same class of bug --
holding BSL's key instead of core's own -- and is fixed the same way; see
the `tenants.json` section above for how this actually happened and its
likely link to the "prod Supabase key invalid" issue. `DB_PASSWORD` was also
just stale (not a syntax issue) and is now correct.

Deploying this fix to the **live** Lambda (`hashpass-prod-expo-router-api`)
is a separate, not-yet-done step -- `.env` only fixes local tooling. That
needs `packages/tools/scripts/deploy-api-lambda.sh` (or the next normal
`infra-deploy.yml` run on a `main` push) and is a real production mutation,
left for a human to trigger deliberately.

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
