# Task: Admin Event Control Center (event-scoped roles + full event admin surface)

**Priority:** High
**Status:** In progress — Phase 1 (schema foundation + privileged pass mutation) merged to `develop` via [PR #92](https://github.com/hashpass-tech/hashpass.tech/pull/92) (2026-07-24) and promoted toward `main` via [PR #93](https://github.com/hashpass-tech/hashpass.tech/pull/93) (v1.8.257, awaiting @edcalderon approval — see repo release flow in `CLAUDE.md`). Phases 2-4 (event-scoped admin UI access, role grant/revoke API + UI, dev/prod schema reconciliation) pushed directly to `develop` the same day, not yet released. `V012`-`V015` migrations applied and verified on **both prod and dev**. Passes and Staff & Roles are now both fully usable end-to-end by event-scoped admins, not just global ones.

## Rollout status

- **`develop`**: Phase 1 merged (PR #92, commit `98b954364` → merge commit `6a3a9d487`); Phases 2-4 pushed directly (`admin.tsx` event-scoped gating, `lib/event-admin-access.ts`, sidebar fix, `/api/admin/roles`, `V013`-`V015`).
- **`main`**: pending — release promotion PR #93 open (covers Phase 1 only, opened before Phases 2-4 landed), needs human approval + coverage/security checks per the protected `develop -> main` flow before it lands. Phases 2-4 will ride the *next* patch release.
- **Prod DB**: `V012`-`V015` all applied and verified 2026-07-24 — 5 seed events present, all 5 new tables (`events`, `event_roles`, `speakers`, `event_agenda_items`, `admin_action_log`) exist with RLS enabled, `has_event_admin_access`/`admin_mutate_event_pass`/`is_super_admin`/`admin_mutate_event_role` all exist, both mutation RPCs are `service_role`-only (not `anon`/`authenticated`), `passes_event_id_fkey`/`event_roles_user_id_fkey` are in place, `passes_event_admin_read` policy confirmed present. `V015` was a confirmed no-op here (prod already had the full baseline).
- **Dev DB**: **fully reconciled and migrated 2026-07-24.** Dev's direct-connect Postgres host is IPv6-only (unreachable from a plain sandbox), but its Supavisor pooler (`aws-0-us-east-2.pooler.supabase.com`, username `postgres.<project-ref>`, same password as `SUPABASE_DB_URL_DEV`) is IPv4-reachable — use that for any future direct psql access to dev. **A real schema divergence was found and fixed in the process**: dev's `user_roles` predated this repo's tracked V001/V003 migrations — `role` was a plain `text` column (no `user_role` enum type existed on dev at all), `granted_by`/`granted_at`/`expires_at`/`metadata` were missing, and neither `is_admin()` nor `get_current_user_id()` existed. `V015__dev_user_roles_schema_parity.sql` fixed this (guarded/idempotent — verified as a safe no-op on prod first, then applied for real on dev). `V012`-`V014` then applied and verified cleanly on dev.

## Role grants (2026-07-24)

Requested by the repo owner in-session; identities intentionally not written here as plaintext email addresses (this file is committed to a public repo) — see internal record for who maps to which ID. Dev and prod are separate Supabase projects with independent `auth.users`, so the same person has a different uuid in each.

- **Prod**: ✅ Grant 1 → `bsl` `event_admin` (`...66fe`). ✅ Grant 2 → `bsl` `event_admin` (`...c364`). ⏸️ Grant 3 (`super_admin` + `bsl` `event_admin`) — **blocked**: that account has no Supabase `auth.users` row on **prod** at all, only a Better Auth (`ba_users`) row and a canonical `public.user` registry row (a *different* uuid than the `ba_users` id). `user_roles.user_id` has a hard FK to `auth.users(id)` (confirmed by a failed insert: `violates foreign key constraint "user_roles_user_id_fkey"`). **Decision (user, 2026-07-24): wait for that account to complete a Supabase-backed sign-in on prod first**, then look up the real `auth.users.id` and grant. Do not create the `auth.users` row directly or substitute another identifier.
  **Broader gap worth tracking separately**: no Better-Auth-only account (no `auth.users` row) can hold any `user_roles` row today, and almost certainly can't meaningfully hold an `event_roles` row either — a structural consequence of `user_roles`/`event_roles` being modeled against Supabase's `auth.users` while Better Auth is a parallel, separately-keyed identity store for the same person.
- **Dev**: ✅ all three grants completed — Grant 3's account *does* have a real `auth.users` row on dev (unlike prod), so it got the full intended set there: global `super_admin` + `bsl` `event_admin`. Grants 1 and 2 also got `bsl` `event_admin` on dev (their dev-project uuids, distinct from their prod uuids).

## Role grants (prod, 2026-07-24)

Requested by the repo owner in-session; identities intentionally not written here as plaintext email addresses (this file is committed to a public repo) — see internal record for who maps to which ID.

- ✅ Grant 1 → `bsl` `event_admin` (`auth.users.id` ending `...66fe`).
- ✅ Grant 2 → `bsl` `event_admin` (`auth.users.id` ending `...c364`).
- ⏸️ Grant 3 → intended `super_admin` (global) + `bsl` `event_admin` — **blocked**. That account has no Supabase `auth.users` row at all, only a Better Auth (`ba_users`) row and a canonical `public.user` registry row — a *different* uuid than the `ba_users` id. `user_roles.user_id` has a hard FK to `auth.users(id)` (confirmed by a failed insert: `violates foreign key constraint "user_roles_user_id_fkey"`); `event_roles.user_id` has no such FK but would very likely be functionally inert anyway, since a Better-Auth-only session's `user.id` in the app is presumably that provider's own string ID, not this uuid. **Decision (user, 2026-07-24): wait for that account to complete a Supabase-backed sign-in (e.g. OTP/email) first**, which creates a real `auth.users` row (and syncs the canonical registry), then grant both roles against that real ID. Do not create the `auth.users` row directly or substitute another identifier — look up the real `auth.users.id` again once sign-in is confirmed, then re-run the grant.
  **Broader gap worth tracking separately**: this means *no* Better-Auth-only account (no `auth.users` row) can hold any `user_roles` row today, and almost certainly can't meaningfully hold an `event_roles` row either — not specific to this one account, a structural consequence of `user_roles`/`event_roles` being modeled against Supabase's `auth.users` while Better Auth is a parallel, separately-keyed identity store for the same person.

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
7. **Resolved 2026-08-15: top-level event creation moves to the hashpass.club web panel, not this mobile admin surface.** This task's own `events`/`event_roles` schema and `has_event_admin_access()`/`admin_mutate_event_role()` RPCs remain the shared source of truth and are expected to be reused by whatever route the web panel ends up calling (see `.agents/active/task-panel-web-club-events-qr.md`, Phase A). What stays in this task's scope under the old "Add `/api/admin/events`" line is narrower: **sub-events/side-events** nested under an already-published parent event, not the parent event itself.

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

**Review fixes applied before merge** (2026-07-24): stripped a hand-rolled version/changelog/README bump that had been bundled into the feature branch — version bumps don't belong in a feature PR per this repo's release policy, and this one was incomplete (missed `app.json`), which is what was actually failing CI's coverage/test check; and fixed the pass-upgrade limits bug described above.

**Phase 2 (2026-07-24, direct to `develop`, not yet released):** closed the top-priority gap from Phase 1.
- `db/migrations/V013__event_admin_passes_read.sql` — adds `passes_event_admin_read`, an RLS `SELECT` policy on `passes` using `has_event_admin_access(auth.uid(), event_id, false)`. Deliberately `event_admin`-only, not `moderator` (pass rows carry PII — email, company — and moderator pass access is still an open question, see below). Applied and verified on **both prod and dev**.
- `apps/mobile-app/lib/event-admin-access.ts` — new client helper, `getUserEventRoles(userId)` (reads the caller's own `event_roles` rows, permitted by V012's `event_roles_self_read` policy) and `highestEventRole(grants, eventId)`.
- `admin.tsx`'s `checkAdminAccess()` now falls back to event-scoped access when the user isn't a global admin: if they hold any unexpired `event_admin`/`moderator` grant, they get into the panel, scoped to that event (or a switcher, if more than one). Global admin behavior is completely unchanged (same ambient-event resolution as before, zero new code path for them).
- Added a lightweight event switcher (chip row under the header) for users with more than one event grant.
- The **Passes tab is hidden entirely for `moderator`** — `admin_mutate_event_pass` already excluded moderators from pass mutations (`include_moderator=false`), and V013 excludes them from pass reads too, so there was nothing left for a moderator to do there. They land on QR Scanner instead.
- **Not addressed in Phase 2** (still open): `/api/admin/events`, `/api/admin/roles`, speaker/agenda/venue CRUD, attendee/check-in view, `admin_action_log` viewer, legacy event ID reconciliation. See Delivery plan below.

**Phase 3 (2026-07-24, direct to `develop`, not yet released):**
- `db/migrations/V014__admin_event_role_management.sql` — `admin_mutate_event_role(actor, event_id, action, target_user_id, role, expires_at)`, a `service_role`-only RPC mirroring `admin_mutate_event_pass`. Self-authorizes (only `is_super_admin()` may grant/revoke `event_admin`; `is_super_admin()` OR `has_event_admin_access(..., include_moderator=false)` — i.e. a `super_admin` or that event's own `event_admin` — may grant/revoke `moderator`), upserts/deletes the `event_roles` row, writes `admin_action_log`. Also adds `event_roles_user_id_fkey` (FK to `auth.users`) — `event_roles` was the one role table missing this; see the Role grants section above for exactly why that matters.
- `apps/mobile-app/app/api/admin/roles+api.ts` — `POST /api/admin/roles`: rate-limited, validates shape, authenticates, calls the RPC, maps a `42501` Postgres error to HTTP 403. No UI wired to it yet — for now, role grants/revokes happen by calling this route directly or via the RPC.
- **Sidebar fix**: `apps/mobile-app/app/(shared)/dashboard/_layout.tsx`'s `CustomDrawerContent` — the "Admin Panel" menu item was still gated on the old global-only `isAdmin()`, so an event-scoped-only admin had no visible entry point into a panel that already supported them since Phase 2. Now falls back to `getUserEventRoles()` the same way `admin.tsx` does.
- Tests: `apps/mobile-app/tests/api/admin-roles.test.ts` (invalid input, 403 mapping, authorized-grant path).
- Applied and verified on **both prod and dev**.

**Phase 4 (2026-07-24, direct to `develop`, not yet released):** dev/prod DB reconciliation (`V015`, see Rollout status above) plus the Staff & Roles UI.
- Added `GET /api/admin/roles?eventId=...` (list current grants for an event — `event_roles`' own RLS only permits reading your own row, so listing everyone else's needed the same `has_event_admin_access`-authorized, service-role path as the mutation routes) and a test for it.
- `admin.tsx` now has a **Staff & Roles tab** (visible to the same audience as Passes — global admin or that event's `event_admin`): lists current grants, a Grant Role modal, per-row Revoke. The grant modal only offers `event_admin` as an option when `adminRole === 'super_admin'` specifically — mirrors `admin_mutate_event_role`'s real rule (a plain global `admin`, not `super_admin`, can grant `moderator` but not `event_admin`) instead of showing a button that would just 403.

## What's NOT done yet (next phases)

- **No `/api/admin/events` route** — no way to create/edit an event (info, venue, branding) from the UI or an API. `events` rows exist only via the V012 seed insert. **Rescoped 2026-08-15**: top-level event creation/publishing (the kind that shows up on hashpass.tech) is owned by the hashpass.club web panel now, not this mobile admin surface — see `.agents/active/task-panel-web-club-events-qr.md`. What's still open here is narrower: creating/editing **sub-events or side events** nested under an already-published top-level event (e.g. a satellite session, breakout track, or associated smaller gathering tied to a parent event), not the parent event itself.
- **No speaker/agenda/venue CRUD** — UI and API routes both outstanding. The `speakers`/`event_agenda_items` tables exist but nothing writes to them yet.
- **No active/checked-in users view** for event admins.
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
- [x] Fix `checkAdminAccess()` to recognize event-scoped `event_admin`/`moderator`, not just global `isAdmin()`.
- [x] Add an RLS policy so event-scoped `event_admin`s can list passes for their event without needing global `admin` (`moderator` intentionally excluded, pending the open question below).
- [x] Add an event switcher to the Admin Panel; scope all reads/writes to the selected event.
- [x] Add `/api/admin/roles` (grant/revoke `event_admin`/`moderator`, enforcing the escalation rule above).
- [x] Add a "Staff & Roles" tab in `admin.tsx` that calls `/api/admin/roles`.
- [x] Reconcile dev's schema to prod's baseline (`V015`) and apply `V012`-`V015` to both environments.
- [ ] Add `/api/admin/events` scoped to **sub-events/side-events only** (create/edit a child event's info, venue, branding, nested under an existing parent `events` row) + UI. Top-level event creation/publishing is out of this task's scope as of 2026-08-15 — it's owned by the hashpass.club web panel, see `.agents/active/task-panel-web-club-events-qr.md`.
- [ ] Add agenda and speaker CRUD routes and UI.
- [ ] Import remaining TypeScript event metadata into `events`/`speakers`/`event_agenda_items`; reconcile legacy `passes.event_id` values against real `events` rows.
- [ ] `VALIDATE CONSTRAINT passes_event_id_fkey` once legacy data is reconciled.
- [ ] Add attendee search, bulk operations, dashboards, and an `admin_action_log` viewer.
- [ ] Retire `packages/config/src/events.ts` once `events` is authoritative everywhere.

## Open questions still remaining

- Should `bsl_speakers` eventually be merged into the new generic `speakers` table, or intentionally kept separate long-term (BSL's meeting-matching system vs. general event speaker directory)?
- Does "moderator" get any pass-adjacent capability at all (e.g., QR check-in / suspend-on-suspicion), or is it purely read/moderate-content? The DB decision (`has_event_admin_access(..., p_include_moderator=false)` for pass mutation) currently excludes moderators from all pass actions — confirm this is intentional before building moderator-facing UI.
