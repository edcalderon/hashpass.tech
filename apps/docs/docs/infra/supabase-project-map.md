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

## `db/migrations/` now bootstraps a truly blank database on its own (fixed 2026-08-06)

The point above closed the gap for the one real dev project by applying a
schema dump directly -- but that's an out-of-band workaround, not a fix to
the migration files themselves. An automated code review correctly flagged
that running `db/migrations/V000` through `V062` **in file order against a
genuinely blank database** (no dump applied first) still fails partway
through -- V009 hits `relation "public.meeting_slots" does not exist"
immediately, and that was only the first of eight such gaps.

Verified by actually testing it: spun up a disposable `postgres:17-alpine`
Docker container (not Supabase, not the real dev project -- fully
disposable, discarded after), approximated the Supabase-specific baseline
(`extensions` schema, `auth.users` + `auth.uid()`/`auth.role()`/`auth.jwt()`
stubs, the `anon`/`authenticated`/`service_role` roles), then ran all 62
files in sequence with `ON_ERROR_STOP=1`, fixing each failure at its exact
point of first use (same pattern as the V000/V009 fixes above: add the
missing baseline object as a guarded, idempotent statement directly in the
first migration file that needs it, sourced from the verified BSL prod
schema dump used for the dev bootstrap, never guessed). Every fix was
re-verified by re-running the full sequence from that point forward, and
the **entire V000-V062 sequence was re-verified end-to-end from a second,
completely fresh container** after all fixes landed, to rule out any
ordering artifact from incremental debugging.

Gaps found and fixed, in the order they were hit:

| File | What was missing |
|---|---|
| `V007` | `passes.pass_type` column (the `pass_type` enum type existed, but no migration ever added the column that uses it) |
| `V009` | `meeting_slots` table entirely, plus `meetings.slot_id`/`host_id`/`attendee_id`/`start_time`/`end_time`/`attendee_email`/`event_id` columns and FKs |
| `V017` | `notifications` table entirely, plus the base `create_notification(uuid,text,text,text,uuid,text,boolean,uuid)` function this file's own wrapper calls |
| `V022` | `user_agenda_status` table entirely (indexes, RLS, all 4 owner-only policies) |
| `V024` | `event_agenda` table entirely (this file only ever replaces its `type` CHECK constraint, never created the table) |
| `V038` | `passes.status`/`purchase_date`/`price_usd`/`max_meeting_requests`/`used_meeting_requests`/`max_boost_amount`/`used_boost_amount`/`access_features`/`special_perks`; a long list of `meeting_requests` columns (`event_id`, `speaker_name`, `requester_name`, `requester_company`, `requester_title`, `requester_ticket_type`, `preferred_date`, `preferred_time`, `boost_transaction_hash`, `priority_score`, `availability_window_start/end`, `meeting_scheduled_at`, `meeting_location`, `meeting_id`); `meeting_requests.status` converting from the `meeting_request_status` enum to plain text with a wider CHECK (had to drop/recreate a dependent RLS policy and two partial indexes around the type change) |
| `V039` | `passes.pass_number` converting from `serial` (V001's original type) to `text` |
| `V053` | `meeting_chat_messages.meeting_id` column + FK (this file already handled dropping the legacy `meeting_request_id`/`message` columns, but never added the column its own new policies reference) |

**Why these were never caught before:** several are inside `plpgsql`
function bodies (`accept_meeting_request`, `get_speaker_available_slots`,
etc.) that Postgres doesn't fully validate at `CREATE FUNCTION` time --
only when the function actually *runs*. Migration files that only define
functions referencing a missing column pass silently; the eight gaps above
are all cases where a column/table is referenced in plain top-level
SQL (`CREATE POLICY`, `UPDATE ... SET`, an index predicate) that Postgres
validates immediately.

One thing intentionally **not** attempted: `archive/legacy-root/supabase/migrations/`
holds the real, dated original migration history for several of these
objects (e.g. `20251031050000_create_user_agenda_status.sql`,
`20251219000001_create_notifications_table.sql`) from before this repo
adopted the `V0xx` convention. The fixes above are sourced from the
*current* live BSL prod schema dump instead of those originals, since a
lot of further out-of-band drift happened on top of those original shapes
too, and a fresh bootstrap needs to match what's live today, not replay
1:1 history that itself doesn't reflect the current state.

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

## Resolved: core prod credential (fixed 2026-08-06, corrected further 2026-08-15)

The ref-mismatch issue previously documented here is fixed. A working
core-prod DB credential was obtained; local `.env`'s `SUPABASE_DB_URL_PROD`
now correctly points at `fxgftanraszjjyeidvia` (verified via a live
connection, not assumed), and a stale duplicate
`SUPABASE_DB_URL_PROD`/`DATABASE_URL_PROD` pair further down the file
(holding BSL's connection string, which was silently winning via bash's
last-definition-wins `source` behavior) was removed. `DB_PASSWORD` was also
just stale (not a syntax issue) and is now correct.

**2026-08-15 correction: the 2026-08-06 fix was necessary but not
sufficient.** `SUPABASE_SERVICE_ROLE_KEY_PROD` did get pointed at the
correct ref (`fxgftanraszjjyeidvia`, was BSL's) that day, but the fix was
never actually tested against a live endpoint, and a **second, independent**
bug was hiding behind it: core-production's Supabase project has completed
Supabase's key-format migration and now rejects *every* legacy JWT-format
key outright, correct ref/role/expiry or not. Confirmed empirically with a
direct `curl` against `/rest/v1/` and `/auth/v1/admin/users` -- both gave a
real `401 Invalid API key` straight from Supabase's own gateway for the
JWT-format key, and both succeeded (`200`) with `SUPABASE_API_KEY`'s value
(new `sb_secret_...` format) substituted in. Also found the same day: three
more vars (`EXPO_PUBLIC_SUPABASE_URL_PROD`, `EXPO_PUBLIC_SUPABASE_KEY_PROD`,
`EXPO_PUBLIC_SUPABASE_ANON_KEY_PROD`) had the *original* BSL-ref bug that
`SUPABASE_SERVICE_ROLE_KEY_PROD` had on 2026-08-06 -- never caught then
because only the service-role key was checked at the time. All four are now
fixed in `.env`: the URL/anon-key trio point at `fxgftanraszjjyeidvia`
(matching `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_KEY` in section 4),
and `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SERVICE_ROLE_KEY_PROD` both now
hold `SUPABASE_API_KEY`'s working new-format value (`@supabase/supabase-js`
accepts either key format interchangeably, so no application code needed to
change). The old JWT value is kept, unused, under
`SUPABASE_SERVICE_ROLE_KEY_LEGACY_INVALID` as a documented "don't reach for
this" marker rather than deleted outright.

**Deployed and verified live, 2026-08-15.** Both Lambdas now carry the
corrected values: `hashpass-links-prod-expo-router-api` via a targeted
`terraform apply` (confirmed via a real `200` on
`GET /api/v1/qr-links/slug-availability`), and
`hashpass-prod-expo-router-api` via a direct
`aws lambda update-function-configuration` call after
`deploy-api-lambda.sh`'s own env-sync step silently skipped itself -- see
"env-sync silently no-ops above 4KB" below. Confirmed via
`get-function-configuration` (`EXPO_PUBLIC_SUPABASE_URL` resolves to
`fxgftanraszjjyeidvia`, not `mnnqryrdlhddorqsrtbn`) and a real
`POST /api/auth/otp` call returning `200` against the live API
(`api.hashpass.tech`) -- that route calls `admin.generateLink()`, an
auth-admin-only operation, so a `200` is real proof the key has full
`service_role`-equivalent privileges, not just read access.

### `sb_secret_...` "secret key" is not a downgrade from `service_role`

This came up again while applying the fix above, worth stating explicitly
since the naming looks suspicious at a glance: `SUPABASE_SERVICE_ROLE_KEY*`
variables now holding a `sb_secret_...` value (instead of the old
`eyJ...` JWT) is **not a misnaming**. Per Supabase's own API keys docs:
"Secret keys authorize access to your project's data via the built-in
`service_role` Postgres role. By design, this role has full access to your
project's data," and the secret key format is explicitly described as "an
improvement over the old JWT-based `service_role` key." Same Postgres
role, same full access, same RLS bypass -- only the credential *format*
changed as part of Supabase's platform-wide key migration (paired with
`anon` key -> `sb_publishable_...`). The env var name should keep
describing the credential's *role* in our system (`SERVICE_ROLE_KEY`);
it's expected for the value itself to be in the new format once a
project completes migration, exactly as `EXPO_PUBLIC_SUPABASE_KEY` /
`_ANON_KEY` already are.

### `.env` hygiene found while fixing this, 2026-08-15

Two dead, near-identical-looking variable names turned out to be
transcription typos, silently unused because nothing in the codebase
reads the misspelled name:

- `SUBAPASE_SERVICE_ROLE_KEY_PROD` (letters transposed: "SUB-APASE" vs
  "SUP-ABASE") -- held a copy of the same legacy JWT as
  `SUPABASE_SERVICE_ROLE_KEY_LEGACY_INVALID` above, but differing by a
  single character in the signature (`TdHm` vs `TdHM`) -- two drifted
  copies of what was meant to be one value. Deleted; the
  `_LEGACY_INVALID` marker is the single source of truth for "this is the
  old rejected JWT, do not resurrect it."
- `BSL_SUPABAS_API_KEY` (missing the "E" in SUPABASE) -- renamed to
  `BSL_SUPABASE_API_KEY`, matching the working, correctly-named
  `SUPABASE_API_KEY` above it.

**Lesson:** a typo'd env var name doesn't error -- it just silently
creates an unused variable next to the real one, and both can look
equally plausible on a quick read. If a credential looks like it "isn't
taking effect," grep the codebase for the exact variable name before
assuming the value itself is wrong.

### `deploy-api-lambda.sh`'s env-sync silently no-ops above 4KB

Found while deploying this fix: `sync_lambda_environment` in
`packages/tools/scripts/deploy-api-lambda.sh` merges a ~25-key allowlist
into whatever the Lambda's current env already has, then **skips the
entire sync with only a warning** (not a failure) if the merged JSON
exceeds a conservative 3900-byte safety threshold.
`hashpass-prod-expo-router-api`'s config was already at 4027/4096 bytes --
AWS's real hard cap on total Lambda env-var JSON is 4096 bytes -- and a
dozen of those allowlist keys (`_DEV`/`_PROD`-suffixed variants,
`EXPO_PUBLIC_SUPABASE_PROFILE`, `SITE_URL`, etc.) don't exist on this
Lambda at all, so merging them pushed the payload to 5066 bytes and the
sync silently skipped, **including the 4 keys that actually mattered**
for this fix. The code deploy itself still "succeeded" and logged
`API version verified`, so nothing outwardly looked wrong -- this is
easy to miss unless you read the full deploy log. Worked around by hand
-building a minimal payload with only the 4 keys that both needed new
values and already existed on the Lambda (replacement values were
same-or-shorter, since `sb_secret_.../sb_publishable_...` format is much
shorter than the old JWTs), applied via a direct
`aws lambda update-function-configuration` call. **Not yet fixed in the
script itself** -- a future change should either prune `syncKeys` to only
the vars each specific Lambda actually uses, or turn a size-limit skip
into a hard failure so a deploy can't quietly no-op the exact sync it was
run for.

## Third layer of the same bug found and fixed: the web site's own CodeBuild env vars (2026-08-16)

A real production user reported `hashpass.tech`'s browser JS making a raw
`GET https://mnnqryrdlhddorqsrtbn.supabase.co/auth/v1/user` request that
403'd, plus Realtime "mismatch between server and client bindings" errors
and passes not loading. Root cause: **`hashpass-prod-site-build`'s live
CodeBuild environment variables had `EXPO_PUBLIC_SUPABASE_URL`/`_PROD`/
`_KEY`/`_ANON_KEY_PROD` all set to BSL's project** (`mnnqryrdlhddorqsrtbn`)
-- baked directly into the client-side JS bundle at build time, so every
browser session on the live site was running a Supabase client pointed at
the wrong project, while the server-side API (already fixed the same
session) correctly used core-production. Client and server disagreeing on
which project a session belongs to is exactly what produced the 403 and
the Realtime binding mismatch.

**`hashpass-dev-site-build` had the mirror-image bug**: its vars were set
to core-**production**'s project (`fxgftanraszjjyeidvia`) instead of the
shared dev project (`gsugeqozyeokncpbndna`) -- as if the three
environments (BSL-prod, core-prod, shared-dev) had been rotated one
position off across the two CodeBuild projects.

**Actual root cause, not just a symptom**: `stacks/hashpass-web/terraform.tfvars.example`
had these exact same two values swapped from day one (`supabase_url` =
BSL's project, `supabase_url_dev` = core-production's project) -- whoever
originally provisioned these CodeBuild projects via `terraform apply` very
likely copied this example verbatim. Fixed the example file itself, not
just the live AWS state, so a future apply of this stack (see the
Terraform drift warning in
`hashpass-api-target-terraform-env-drift.md` -- this stack has its own
separate, unrelated apply-time drift risk) doesn't reintroduce this exact
bug again.

**Fixed live** via `aws codebuild update-project` on both
`hashpass-prod-site-build` and `hashpass-dev-site-build`, followed by a
real `aws codepipeline start-pipeline-execution` rebuild+redeploy of
`hashpass-production-site`. Verified by downloading the newly-deployed
live JS bundle directly and confirming zero occurrences of
`mnnqryrdlhddorqsrtbn` and five occurrences of the correct
`fxgftanraszjjyeidvia`, plus a real headless-browser load of
`https://hashpass.tech` showing zero console errors.

**This is now the third independent place this exact "BSL project under
core's name" class of bug was found and fixed in the same investigation
arc** (`.env` + GitHub Actions vars/secrets on 2026-08-15, the
`hashpass-prod-expo-router-api` Lambda later that same session, and now
this CodeBuild project). If this class of bug turns up a fourth time,
audit every remaining place a Supabase URL/key can be configured
end-to-end, don't assume any single layer's fix is the last one --- see
the client-side call reduction note in
`.agents/pending/task-reduce-direct-supabase-client-calls.md` for the
follow-up this incident prompted.

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
