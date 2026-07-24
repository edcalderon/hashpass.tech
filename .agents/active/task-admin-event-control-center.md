# Task: Admin Event Control Center (event-scoped roles + full event admin surface)

**Priority:** High
**Status:** In progress — Phase 1 (schema foundation + privileged pass mutation) merged to `develop` via [PR #92](https://github.com/hashpass-tech/hashpass.tech/pull/92) (2026-07-24) and promoted toward `main` via [PR #93](https://github.com/hashpass-tech/hashpass.tech/pull/93) (v1.8.257, awaiting @edcalderon approval — see repo release flow in `CLAUDE.md`). `V012` migration applied and verified on **prod**; **dev is not yet migrated** (see Rollout status below). UI/role-management surfaces are not built yet.

## Rollout status

- **`develop`**: merged (PR #92, commit `98b954364` → merge commit `6a3a9d487`).
- **`main`**: pending — release promotion PR #93 open, needs human approval + coverage/security checks per the protected `develop -> main` flow before it lands.
- **Prod DB (`hashpass-prod`, pooler-reachable)**: `V012` applied and verified 2026-07-24 — 5 seed events present, all 5 new tables (`events`, `event_roles`, `speakers`, `event_agenda_items`, `admin_action_log`) exist with RLS enabled, `has_event_admin_access`/`admin_mutate_event_pass` exist, `admin_mutate_event_pass` execute is `service_role`-only (not `anon`/`authenticated`), `passes_event_id_fkey` (`NOT VALID`) is in place.
- **Dev DB (`fxgftanraszjjyeidvia`)**: **not yet applied.** Its direct-connect Postgres host is IPv6-only and wasn't reachable from the environment this migration was run in (no pooler URL was available for dev, unlike prod). Run manually from a machine with normal connectivity:
  ```bash
  set -a; source .env; set +a
  psql "$SUPABASE_DB_URL_DEV" -v ON_ERROR_STOP=1 -f db/migrations/V012__admin_event_control_center.sql
  ```
  Until this runs, dev-environment builds (`EXPO_PUBLIC_SUPABASE_PROFILE=core-development`, routed to `hashpass-dev-expo-router-api`) will get a hard DB error from `/api/admin/passes` (RPC not found) rather than silently misbehaving — safe to leave briefly, but should be applied before anyone relies on dev for testing this feature.

## Goal

Build a proper admin system so that:

- A **super admin** can create events, and grant/revoke per-event `event_admin` and `moderator` roles to any user, without touching the global admin role.
- An **event admin** (scoped to one event) has full control of that event: create/revoke/upgrade/suspend passes, view active/checked-in users, manage speakers, edit the agenda, and edit the event's info/venue details.
- A **moderator** gets a reduced subset: operational moderation only — no role management, no event metadata/pass/speaker/agenda edits.

## Decisions (resolved 2026-07-24, via PR #92)

These were open questions in the original spec; they are now settled and implemented:

1. **Global `super_admin`/`admin` still imply admin-everywhere.** `has_event_admin_access()` short-circuits true for global `admin`/`super_admin` before checking `event_roles`. No backfill needed for existing admins.
2. **`event_admin` can grant/revoke `moderator` for their own event, but never `event_admin`.** Role-escalation is bounded: only a global `super_admin` can grant `event_admin`.
3. **`moderator` is intentionally narrow**: operational moderation (expected: check-in/QR, viewing attendees) but explicitly no role, metadata, pass, speaker, or agenda access.
4. **Event config keeps a TypeScript fallback during migration** — `events` DB rows are the mutable source of truth once an event is imported/seeded; the old hardcoded `packages/config/src/events.ts` is not deleted yet (dual-read period).
5. **`bsl_speakers` is not renamed.** A new, generic `speakers` table was introduced instead (`event_id`-scoped from day one), decoupled from the legacy BSL-specific meeting-matching tables. This avoids the FK-migration risk called out in the original spec, at the cost of running two speaker tables in parallel until `bsl_speakers` is retired.
6. **"Revoke" reuses the existing `PassStatus` enum** (`cancelled`/`suspended`) rather than adding a new DB enum value — no `revoked_at`/`revoked_by`/`reason` columns yet. Accountability instead comes entirely from `admin_action_log` (actor/event/action/target per mutation), not from columns on `passes` itself.

## What's done (merged to `develop` via PR #92, 2026-07-24)

DB migration `db/migrations/V012__admin_event_control_center.sql`:
- `events` table (id, name, slug, status, dates, timezone, venue fields, branding/metadata jsonb), seeded with `bsl`, `bsl2025`, `peru2026`, `chile2026`, `colombia2026`.
- `event_roles` table (`event_admin` | `moderator`, per event, with `expires_at`).
- `speakers` table (generic, event-scoped, optional `user_id` link).
- `event_agenda_items` table (event-scoped, ordered, with a `speaker_ids uuid[]` array).
- `admin_action_log` table (append-only audit trail: actor, event, action, target, metadata).
- `has_event_admin_access(user_id, event_id, include_moderator)` SQL helper — the event-scoped equivalent of `is_admin()`.
- `admin_mutate_event_pass(...)` — SECURITY DEFINER RPC, `service_role`-only, authorizes via `has_event_admin_access`, handles pass `create`/`update` (status change and tier upgrade/downgrade), recomputes `max_meeting_requests`/`max_boost_amount`/`access_features`/`special_perks` on a tier change (fixed post-review — the original PR changed `pass_type` without recomputing limits, so an "upgraded" pass kept its old tier's caps), and writes an `admin_action_log` row per mutation.
- RLS enabled on all five new tables; `passes.event_id` gets a staged `NOT VALID` FK to `events.id` (won't break on unreconciled legacy rows; needs `VALIDATE CONSTRAINT` later once data is clean).

Backend:
- `apps/mobile-app/lib/server/event-admin.ts` — `authorizeEventAdmin(request, eventId)`: authenticates the request, calls `has_event_admin_access` via a service-role server client, returns 401/403/500 or `{ userId, supabase }`.
- `apps/mobile-app/app/api/admin/passes+api.ts` — `POST /api/admin/passes`: rate-limited, validates `eventId`/`userId`/`passId`/`passType`/`status` before any DB call, authorizes via the helper above, then calls `admin_mutate_event_pass`. This is the replacement for the now-locked-down self-service `create_default_pass` RPC (V011) — admins can once again mint a pass for another user, but only through this authorized, audited, service-role path.

Frontend:
- `admin.tsx`'s existing pass create/update actions now call `POST /api/admin/passes` instead of the self-service RPC or a direct client-side `passes` table update.

Tests: `apps/mobile-app/tests/api/admin-passes.test.ts` covers invalid input (rejected pre-auth/pre-DB), unauthorized caller (403, no mutation attempted), and an authorized mutation using the authenticated actor's ID (not a client-supplied one).

**Review fixes applied before merge** (this session): stripped a hand-rolled version/changelog/README bump that had been bundled into the feature branch — version bumps don't belong in a feature PR per this repo's release policy, and this one was incomplete (missed `app.json`), which is what was actually failing CI's coverage/test check; and fixed the pass-upgrade limits bug described above.

## What's NOT done yet (next phases)

- **The Admin Panel's entry gate is still global-only.** `checkAdminAccess()` in `admin.tsx` still calls the old `isAdmin(user.id)` (checks `user_roles` only). A user who is granted `event_admin`/`moderator` via the new `event_roles` table has **no way to reach the admin UI at all yet** — the new role only currently matters to the one server route that checks it directly (`/api/admin/passes`). This is the top-priority next step.
- **No event switcher / event-scoped navigation** in the UI.
- **No `/api/admin/events`, `/api/admin/roles` routes** — no way to create an event, or grant/revoke `event_admin`/`moderator`, from the UI or an API. Right now the only way to populate `event_roles` is a direct DB insert.
- **No speaker/agenda/venue CRUD** — UI and API routes both outstanding. The `speakers`/`event_agenda_items` tables exist but nothing writes to them yet.
- **No active/checked-in users view** for event admins.
- **`passes` client-side reads (`loadPasses()` in `admin.tsx`) are still gated by the old `passes_admin_all` RLS policy** (`is_admin()`, global-only) — an event-scoped-only admin (not a global admin) would see zero rows in the passes list today even after the gating above is fixed, because there's no `passes` RLS policy yet that checks `has_event_admin_access`. Needs either a new RLS policy or (more consistent with the "server-controlled writes" principle already established) moving the read path through an authorized server route too.
- **No `admin_action_log` viewer.**
- **Legacy event ID reconciliation not done** — `passes.event_id` FK is `NOT VALID`; still needs a data-cleanup pass and `ALTER TABLE ... VALIDATE CONSTRAINT` once legacy/unknown event IDs are resolved.
- **TypeScript config (`packages/config/src/events.ts`) not yet retired** — still the source of truth for anything not yet imported into `events`.

## Security requirements (status)

- ✅ No privileged pass mutation goes through a client-callable RLS bypass — `admin_mutate_event_pass` is `service_role`-only, called from a server route.
- ✅ Every privileged pass mutation writes to `admin_action_log`.
- ✅ Rate limiting applied to the new route (`rateLimitOk`, same helper as existing `qr/admin*` routes).
- ✅ RLS enabled on every new table from the migration that creates it.
- ⚠️ Role-grant authorization (event_admin → moderator, super_admin → event_admin) is specified in `has_event_admin_access`'s design and the Decisions above, but **there is no role-grant route yet to enforce it against** — nothing to audit here until that route exists.

## Delivery plan

- [x] Record role/permission decisions and phased migration plan.
- [x] Add the event-control schema foundation (`events`, `event_roles`, `speakers`, `event_agenda_items`, `admin_action_log`) and seed known configured events.
- [x] Add a privileged, event-authorized pass mutation route (`admin_mutate_event_pass` + `/api/admin/passes`) with audit logging.
- [x] Move the current Admin Panel create/status pass mutations to the server route.
- [x] Fix pass-upgrade to recompute tier limits/perks, not just relabel `pass_type`.
- [ ] Fix `checkAdminAccess()` to recognize event-scoped `event_admin`/`moderator`, not just global `isAdmin()` — **blocking everything below**.
- [ ] Add `/api/admin/events` (create/edit event info, venue, branding) and `/api/admin/roles` (grant/revoke `event_admin`/`moderator`, enforcing the escalation rule above) + UI.
- [ ] Add agenda and speaker CRUD routes and UI.
- [ ] Add an event switcher to the Admin Panel; scope all reads/writes to the selected event.
- [ ] Add an RLS policy (or server-routed read) so event-scoped admins can list passes for their event without needing global `admin`.
- [ ] Import remaining TypeScript event metadata into `events`/`speakers`/`event_agenda_items`; reconcile legacy `passes.event_id` values against real `events` rows.
- [ ] `VALIDATE CONSTRAINT passes_event_id_fkey` once legacy data is reconciled.
- [ ] Add attendee search, bulk operations, dashboards, and an `admin_action_log` viewer.
- [ ] Retire `packages/config/src/events.ts` once `events` is authoritative everywhere.

## Open questions still remaining

- Should `bsl_speakers` eventually be merged into the new generic `speakers` table, or intentionally kept separate long-term (BSL's meeting-matching system vs. general event speaker directory)?
- Does "moderator" get any pass-adjacent capability at all (e.g., QR check-in / suspend-on-suspicion), or is it purely read/moderate-content? The DB decision (`has_event_admin_access(..., p_include_moderator=false)` for pass mutation) currently excludes moderators from all pass actions — confirm this is intentional before building moderator-facing UI.
