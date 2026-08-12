---
title: Database schema — single source of truth
---

# Database schema — single source of truth

This doc is the entry point for "what does the schema actually look like
right now, across all three live projects." It complements, but does not
replace, two other things:

- **`db/schema-snapshots/*.sql`** — generated `pg_dump --schema-only` output,
  regenerated on demand with `npm run db:schema:dump`. This is the literal
  ground truth. If this doc and a snapshot ever disagree, the snapshot is
  right and this doc needs updating.
- **`db/migrations/V0xx__*.sql`** — the versioned change log. This is what
  *should* produce the live schema when replayed in order, but has been
  shown more than once (see `supabase-project-map.md`'s "Migration bootstrap
  findings" section) to have drifted from what's actually live. Treat it as
  intent, not ground truth.

**Governance rule going forward: all schema changes go through a new
`db/migrations/V0xx__*.sql` file, applied via `npm run db:migrate`. No ad hoc
DDL directly against a live project.** Every known instance of schema debt
in this repo (V007's missing objects, the eight gaps found bootstrapping a
blank dev DB, this doc's own findings below) traces back to someone running
SQL by hand once and it never getting captured. Regenerate
`db/schema-snapshots/` after every migration batch so drift shows up as a
visible diff instead of silent divergence.

## The three projects

See `supabase-project-map.md` for the full picture (env var priority chains,
tenant resolution). Summary:

| Project ref | Role | Tables (public schema) |
|---|---|---|
| `fxgftanraszjjyeidvia` | core production (`hashpass.tech`) | 88 |
| `mnnqryrdlhddorqsrtbn` | BSL production (`bsl.hashpass.tech`) | 86 |
| `gsugeqozyeokncpbndna` | shared dev (both `core-development` and `bsl-development`) | 86 |

Audited 2026-08-11 via direct `psql` connection to all three (`SUPABASE_DB_URL_PROD`,
`BSL_SUPABASE_DB_URL_PROD`, `SUPABASE_DB_URL_DEV`).

## Finding 1 (fixed): legacy `directus_*` tables exposed via public API on dev

27 `directus_*` tables on the shared dev project had Row-Level Security
disabled, making `directus_users.password` / `.tfa_secret` / `.token` (and
everything else in those tables) readable through the public PostgREST API
with no restriction — Supabase's security advisor flagged this directly.
**Fixed** via `db/migrations/V063__enable_rls_on_legacy_directus_tables.sql`
(RLS enabled, no policies — correct for a dead provider, denies all API
access, service_role unaffected). Full writeup in project memory
`project_directus_rls_exposure_fixed`.

Core prod and BSL prod's `directus_*` tables already had RLS enabled — this
was a dev-only gap.

## Finding 2: core prod's `directus_users` holds 6 real, never-migrated accounts — DO NOT DROP

This directly overrides any blanket "delete unused Directus tables" instinct.
Checked all 11 rows in core prod's `directus_users` against the canonical
`public.user` registry:

| Account label | In `public.user` registry? |
|---|---|
| bootstrap admin account | yes |
| redacted-user-01 | yes |
| redacted-user-02 | yes |
| redacted-user-03 | yes |
| redacted-user-04 | yes |
| redacted-user-05 | **no** |
| redacted-user-06 | **no** |
| redacted-user-07 | **no** |
| redacted-user-08 | **no** |
| redacted-user-09 | **no** |
| redacted-user-10 | **no** |

Six of eleven accounts exist **only** in Directus, with no corresponding row
in the canonical registry — this is exactly the risk a prior explicit
decision (project memory `project_directus_no_longer_needed`, 2026-07-08:
"keep Directus for now, don't delete") called out: *"possible Directus-only
user accounts"*. Dropping `directus_users` (or the whole `directus_*` set)
on core prod would permanently and irrecoverably delete these six people's
only account record. **Do not drop any `directus_*` table on core prod**
until each of these six accounts is either migrated into the registry or a
deliberate decision is made to abandon them.

By contrast, BSL prod and dev's `directus_users` each hold exactly one row —
a Directus bootstrap admin account that already exists in the registry. Those two
projects' `directus_*` tables hold no
real, unrecoverable data (see row counts below) and are lower-risk if a
future decision is made to drop them (RLS is already correctly locking them
down either way; deletion is a data-retention decision, not a security one,
at this point).

## Finding 3: core prod and the BSL-prod/dev lineage have genuinely diverged schemas, not just table-set differences

This confirms and extends what project memory `project_db_migration_debt`
already flagged. Column-level diff (`information_schema.columns`) between
core prod and dev:

- **Tables only in core prod**: `qr_codes`, `qr_scan_logs`, `subpasses`,
  `user_email_tracking` (4 tables — core-only features, not yet ported to
  the BSL-prod/dev migration lineage).
- **Tables only in BSL-prod/dev lineage**: `email_sent_log`,
  `user_transactions` (2 tables — not yet ported to core prod).
- **Same table name, incompatible column shapes** (a non-exhaustive list —
  see `db/schema-snapshots/*.sql` for the full picture):
  - `passes` — core prod has `pass_number:text`, `pass_type` enum,
    `access_features`/`special_perks` arrays; dev/BSL-prod has
    `pass_number:integer`, `tier` enum, `company`/`email`/`name`/`title`
    columns core prod doesn't have. These are not compatible row shapes.
  - `pass_request_limits` — core prod: `remaining_meeting_requests` /
    `remaining_boost_amount` / `last_reset_at`. dev/BSL-prod:
    `max_requests` / `requests_used` / `reset_at`. Different column names
    for what looks like the same concept.
  - `meetings.speaker_id` — **`text` on core prod, `uuid` on dev/BSL-prod.**
    This exact divergence was root-caused as a real bug in v1.8.311 (see
    CLAUDE.md's Recent Fixes) for the dev/BSL-prod side; core prod was never
    touched by that fix and still uses the original `text` type.
  - `bsl_speakers` / `bsl_bookings` / `bsl_tickets` / `bsl_audit` — id
    columns are `text` on core prod, `uuid` on dev/BSL-prod. Column names
    also differ in casing (`attendeeid` vs `attendeeId`-via-view — see
    Finding 4).

**Practical implication**: a migration validated against dev is not safe to
assume works against core prod for anything pass/meeting/BSL-related — this
was already the guidance in `project_db_migration_debt`, and this audit found
nothing that changes it, only more concrete examples. Always diff the live
core-prod object definition first.

## Finding 4: `BSL_Audit` / `BSL_Bookings` / `BSL_Tickets` are NOT duplicate tables

A naive `information_schema.columns` scan makes these look like case-variant
duplicate tables sitting alongside `bsl_audit` / `bsl_bookings` /
`bsl_tickets`. They are not — `pg_class.relkind` confirms the PascalCase
ones are **views** (`relkind = 'v'`), each a thin camelCase-column
compatibility wrapper over the real lowercase table (e.g. `BSL_Bookings`
is `SELECT id, speakerid AS "speakerId", attendeeid AS "attendeeId", ...
FROM bsl_bookings`). They're actively read by live API routes
(`apps/mobile-app/app/api/bsl/bookings+api.ts`,
`verify-ticket+api.ts`, `analytics+api.ts`, `bookings/[id]+api.ts`) — **not
dead, not duplicates, do not touch.** Their 0 row counts on core prod just
mean the BSL booking/ticket feature has no real bookings/tickets yet, not
that the views are unused.

## Finding 5 (fixed): dev was missing two RLS policies on `meeting_chat_messages` — and the real cause went deeper

`meeting_chat_messages` had RLS enabled on all three projects, but zero
policies on dev, even though `hashpass_schema_migrations` showed `V053`/
`V054` as applied. Tracing the actual cause (not just patching the symptom)
surfaced two layers:

1. **`meeting_chat_messages` itself was missing `meeting_id`, `message_type`,
   `read_at`, its FK, and its index** on dev. `message_type`/`read_at` turned
   out to have never been added by any `db/migrations` file at all, on any
   project — they only exist on core prod/BSL prod because someone added
   them directly, out of band, the exact untracked-DDL pattern
   `supabase-project-map.md`'s "Migration bootstrap findings" section
   already documented happening elsewhere.
2. **dev's `meetings` table itself was missing 7 columns** that both prod
   projects have (`event_id`, `slot_id`, `host_id`, `attendee_id`,
   `start_time`, `end_time`, `attendee_email` — the `meeting_slots`-based
   scheduling model V009 was responsible for). Worse: dev's existing
   `meetings_select_participant`/`meetings_update_participant` policies
   called `get_current_user_id()`, a function that reads the Postgres
   session variable `app.user_id` — nothing in the normal Supabase/PostgREST
   request path ever sets that variable (unlike `auth.uid()`, which resolves
   from the request JWT automatically). In practice, dev's `meetings` RLS
   was already unreachable for real authenticated requests, independent of
   chat.

Both prod projects had the correct shape and correct `auth.uid()`-based
policies throughout — this was a dev-only gap, on top of a dev-only gap.

**Fixed 2026-08-11** via `db/migrations/V066__restore_meeting_chat_messages_policies.sql`:
adds the 7 missing `meetings` columns/FKs/indexes, rewrites
`meetings_select_participant`/`meetings_update_participant` to
`auth.uid()`-based logic matching prod, adds the missing
`meeting_chat_messages` columns/FK/index, then recreates its two policies.
0 rows in both tables on dev at the time — zero data-loss risk. Applied to
core prod and BSL prod too (confirmed pure no-op there beforehand by
diffing against their live schema first). Explicit user approval obtained
before the `meetings` RLS rewrite specifically, since it changes real
access-control logic rather than just adding unused columns.

## Finding 6 (fixed): `support_*` tables exist live on all three projects, from an unmerged PR — V063 collision

Seven tables (`support_tickets`, `support_messages`, `support_sessions`,
`support_visitors`, `support_ticket_reads`, `support_idempotency_keys`,
`support_kapso_inbound_events`) already physically exist on **core prod,
BSL prod, and dev** (RLS enabled, zero policies, zero rows everywhere) —
but zero merged app code references any of them; `app/(shared)/support.tsx`
on `develop` is still just a `mailto:` fallback screen. Root cause: PR #168
(`codex/implement-hashpass-support-mvp`, still **open**) contains both the
consumer code and a migration file — also named
`db/migrations/V063__support_system.sql` — and that migration was already
applied directly to all three live databases ahead of merge (per that
branch's own commit message: "applied and round-trip verified... on both
dev and prod").

**This collided with `V063__enable_rls_on_legacy_directus_tables.sql`**,
merged to `develop` the same day. **Fixed 2026-08-11**: renamed PR #168's
migration to `db/migrations/V065__support_system.sql` (commit `3dc205c34`
on `codex/implement-hashpass-support-mvp`, all references in docs/`support-apps.ts`/
the `events+api.ts` route comment updated, PR commented with the change),
and retroactively registered `V065__support_system` in
`hashpass_schema_migrations` on all three live projects (the schema was
already applied out of band; there was no prior tracking row to update, only
to add).

**Do not drop these tables** — they're mid-flight feature work, not dead
schema, even though they look identical to a truly-dead table by every
signal (RLS+0 policies+0 rows) used elsewhere in this audit. This is exactly
why table age/PR status has to be checked, not just live grep.

## Table usage classification (safe-to-delete audit)

Full static-analysis usage audit (grep + RPC function body tracing + trigger
tracing) cross-checked against real row counts on all three live projects.
Two prior misreads this caught, worth remembering as the reason this table
exists rather than a quicker grep-only pass: `BSL_Audit`/`BSL_Bookings`/
`BSL_Tickets` initially looked unused because app code queries the
PascalCase **view**, not the lowercase table grep was matching; and
`user_transactions` initially looked used via `get_user_transactions`, but
that RPC actually reads `reward_transactions` — a same-shaped, differently-
named table that superseded it.

| Table | Verdict | Evidence |
|---|---|---|
| `account`, `verification` | Better Auth internal | Managed directly by the Better Auth library, no `modelName` override — no direct app query is expected |
| `ba_users` | Better Auth internal | Explicit `modelName: 'ba_users'` override in `lib/server/better-auth.ts` |
| `hashpass_schema_migrations` | Tooling bookkeeping | Used by `migrate-tenant-db.mjs`, not app data |
| `BSL_Audit`/`bsl_audit` view+table | **Live** | View queried in `app/api/bsl/bookings/[id]+api.ts`, `bookings+api.ts` |
| `BSL_Tickets`/`bsl_tickets` view+table | **Live** | View queried in `app/api/bsl/verify-ticket+api.ts`, `bookings+api.ts` |
| `BSL_Bookings`/`bsl_bookings` view+table | **Live** | Raw SQL in `lib/server/system-health.ts` (backs `/status`) |
| `admin_action_log` | Live (admin) | Written by several `admin_*` RPCs called from real admin routes |
| `admin_email_deliveries` | Live (admin) | Direct query in `app/api/admin/communications+api.ts` |
| `admin_matchmaking_runs` | Live (admin) | Direct query in `app/api/admin/matchmaking+api.ts` (the admin bulk-pairing tool) |
| `email_sent_log` | Live | `has_email_been_sent`/`mark_email_as_sent` RPCs from onboarding/welcome email routes |
| `pass_code_claims` | Live | Written by `claim_event_pass_code` RPC (`pass-system.ts`) |
| `reward_transactions` | Live (read path) | Read via `get_user_transactions` RPC. Write path (`reward_meeting_accepted`→`add_reward`) is granted but never called — earn-on-accept looks orphaned even though the table itself is live |
| `speaker_identity_claim_event_roles` | Live (trigger) | Written inside `configure_speaker_identity_claim()`, fired by a DB trigger on verified signup |
| `user_chat_keys` | Live | `publish_user_chat_public_key`/`get_user_chat_public_key` RPCs in `chat-encryption.ts` |
| `chat_last_seen` | Live | `update_chat_last_seen` RPC in `MeetingChat.tsx`; cleaned up on account deletion |
| `event_pass_tiers` | Live (admin) | Direct query + `admin_update_event_pass_tier` RPC |
| `pass_claim_codes` | Live (admin+user) | Admin management route + end-user `claim_event_pass_code` redemption |
| `qr_scan_logs` | Live | `lib/qr-system.ts`, `app/api/qr/admin/logs+api.ts` |
| `speaker_identity_claims` | Live (admin) | `app/api/admin/speaker-roles+api.ts`, plus trigger-written |
| `user_balances` | Live | `get_user_balance`/`get_or_create_user_balance` RPCs |
| `user_request_limits` | Live | `canRequestMeeting` in `matchmaking.ts`, called from real screens |
| `user_tutorial_progress` | Live | `useTutorialPreferences.ts`, `useAuth.ts` |
| `user_email_tracking` | Live | Cleaned up in `delete-account+api.ts` |
| `meeting_slots` | Live | Core to the meeting-request system across 13+ migrations |
| `profiles` | Live (indirect) | Populated by a sync trigger; read as a fallback in `get_meeting_chat_participant`, called from `MeetingChat.tsx` |
| `support_*` (7 tables) | **Mid-flight, do not touch** | See Finding 6 |
| **`user_transactions`** | **Dead — deletion candidate** | No reader/writer anywhere; superseded by `reward_transactions` (V023). 0 rows on BSL prod/dev; doesn't exist on core prod at all |
| **`boost_transactions`** | **Dead — deletion candidate** | Only referenced inside `matchmaking.ts` methods with zero external callers. 0 rows on all 3 projects |
| **`chat_messages`** | **Dead — deletion candidate** | Same dead `matchmaking.ts` methods; distinct from the live `meeting_chat_messages` (V053/V054) table. 0 rows on all 3 projects |
| **`speaker_availability`** | **Dead — deletion candidate** | Same dead `matchmaking.ts` methods. 0 rows on all 3 projects |
| **`speed_dating_chats`** | **Dead — deletion candidate** | Same dead `matchmaking.ts` methods. 0 rows on all 3 projects |
| **`subpasses`** | **Dead — deletion candidate** | `pass-system.ts`'s `getUserSubpasses`/`createSubpass` have zero callers; not created by canonical `db/migrations` at all (only archived legacy + core prod's own ad hoc history). Exists only on core prod, 0 rows |
| **`wallet_auth_rate_limits`** | **Dead — deletion candidate** | Only created in archived/stale migration copies, not canonical `db/migrations`; its only consumer (`lib/wallet-auth.ts`) is never imported. 0 rows on all 3 projects |
| **`event_agenda_items`** | **Dead — deletion candidate** | Created by V012 (Admin Event Control Center) but real agenda routes query the separate `event_agenda` table instead; no reader/writer found. 0 rows on all 3 projects |

**8 tables confirmed as real deletion candidates**, each verified two
independent ways: no live code path (static analysis: no direct query, no
RPC reference, no trigger reference) *and* zero rows on every project where
the table exists. `boost_transactions`, `chat_messages`,
`speaker_availability`, `speed_dating_chats` share one root cause — an
attendee-facing speed-dating/boost feature that was built but never wired
to any screen (all methods live only in unreferenced `matchmaking.ts`
methods). `user_transactions`, `subpasses`, `wallet_auth_rate_limits`,
`event_agenda_items` are each independently orphaned (superseded,
never-wired, non-canonical, or replaced by a same-purpose table under a
different name).

FK dependencies among the candidate group (dev): `chat_messages` →
`speed_dating_chats`, `boost_transactions`/`speed_dating_chats` →
`meeting_requests` (outward only, safe), `speaker_availability` →
`bsl_speakers` (outward only, safe), `event_agenda_items` → `events`
(outward only, safe), `user_transactions` → `auth.users` (outward only,
safe). No live table has an FK pointing *into* any candidate table, and no
view depends on any of them — clean to drop with `chat_messages` dropped
before (or `CASCADE`ing into) `speed_dating_chats`.

**RESOLVED 2026-08-11**: dropped via
`db/migrations/V064__drop_dead_matchmaking_and_orphaned_tables.sql`,
applied to core prod, BSL prod, and dev (each project cleanly skipped the
tables it never had — `subpasses` on BSL prod/dev, `user_transactions` on
core prod — via `DROP TABLE IF EXISTS ... CASCADE`). Verified all 8 gone
from all 3 projects afterward; `db/schema-snapshots/` regenerated to match.

## Maintaining this doc

1. Run `npm run db:schema:dump` before trusting anything in this file for a
   real decision — it may be stale.
2. When a `db/migrations/V0xx__*.sql` file changes the schema, regenerate
   snapshots and update this doc's affected section in the same PR.
3. If you find schema that exists live but isn't captured in
   `db/migrations/`, that's schema debt — either author a migration that
   would produce it from a blank database (preferred), or explicitly log it
   here as a known, deliberate gap. Don't just silently note it and move on;
   that's exactly how the gaps in Finding 3 accumulated.
