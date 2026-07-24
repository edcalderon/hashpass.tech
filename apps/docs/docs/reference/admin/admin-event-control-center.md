# Admin Event Control Center

## Overview

HASHPASS roles were global-only (`user_roles`: `user` | `speaker` | `organizer` | `admin` | `super_admin`, no event scoping) and events themselves were hardcoded TypeScript config (`packages/config/src/events.ts`), not database rows. This meant there was no way to grant someone admin control of a single event without making them a global admin, and no durable way to edit an event's agenda, speakers, or venue info — doing so meant editing and redeploying a TypeScript file.

This is being replaced with an event-scoped admin model, delivered in phases. This page documents what exists today; see `.agents/active/task-admin-event-control-center.md` in the repo root for the full roadmap and outstanding phases.

## Role model

Two independent axes:

- **Global** (`user_roles`, unchanged): `admin` / `super_admin` continue to imply administrative access to **every** event — no backfill was needed when event scoping was introduced.
- **Event-scoped** (new `event_roles` table): `event_admin` | `moderator`, scoped to one `event_id`.
  - Only a global `super_admin` can grant `event_admin`.
  - An `event_admin` can grant/revoke `moderator` for their own event, but never `event_admin` (no self-escalation path).
  - `moderator` is intentionally narrow: operational moderation only — no role, event metadata, pass, speaker, or agenda access.

## Schema (`db/migrations/V012__admin_event_control_center.sql`)

| Table | Purpose |
|---|---|
| `events` | Mutable event identity: name, slug, status (`draft`/`published`/`archived`), dates, timezone, venue fields, branding/metadata `jsonb`. Seeded with the events already live in the TypeScript config (`bsl`, `bsl2025`, `peru2026`, `chile2026`, `colombia2026`). |
| `event_roles` | Per-event `event_admin` / `moderator` assignments, with `expires_at` support (same shape as the existing global `user_roles`). |
| `speakers` | Generic, event-scoped speaker directory with an optional `user_id` link. Separate from the legacy BSL-specific `bsl_speakers` table used by the meeting-matching system — the two are not merged (see Known limitations). |
| `event_agenda_items` | Event-scoped, ordered agenda entries, with a `speaker_ids uuid[]` array. |
| `admin_action_log` | Append-only audit trail (actor, event, action, target, metadata) for every privileged mutation. |

`passes.event_id` gained a **staged** foreign key to `events.id` (`NOT VALID`), so it doesn't reject any pre-existing legacy `event_id` values — it needs a data-reconciliation pass and `ALTER TABLE ... VALIDATE CONSTRAINT` once every live pass row points at a real `events` row.

## Authorization

`has_event_admin_access(user_id, event_id, include_moderator)` is the event-scoped equivalent of the existing `is_admin()` helper (`db/migrations/V003__row_level_security.sql`): it returns true immediately for a global `admin`/`super_admin`, otherwise checks `event_roles` for an unexpired `event_admin` (and `moderator`, if `include_moderator` is true) row for that event.

## Privileged pass mutations

`create_default_pass` (the self-service RPC) was locked down in `V011__secure_upcoming_bsl_pass_provisioning.sql` to only mint a pass for the authenticated caller themselves — an admin can no longer mint a pass on behalf of someone else through it. The replacement path for admin-initiated pass management:

- **`admin_mutate_event_pass(actor_user_id, event_id, action, ...)`** — a `SECURITY DEFINER` RPC, granted to `service_role` only (not `authenticated`/`anon`). It re-checks `has_event_admin_access` itself before mutating anything, handles `create` and `update` (status changes, and tier upgrade/downgrade), recomputes `max_meeting_requests` / `max_boost_amount` / `access_features` / `special_perks` from `get_pass_type_limits` whenever `pass_type` changes (an upgrade must change the tier's actual limits and perks, not just relabel the pass), and writes one `admin_action_log` row per call.
- **`POST /api/admin/passes`** (`apps/mobile-app/app/api/admin/passes+api.ts`) — the only caller of the RPC above. It rate-limits by IP, validates `eventId`/`userId`/`passId`/`passType`/`status` before any DB call, authorizes the request via `authorizeEventAdmin()` (`apps/mobile-app/lib/server/event-admin.ts`), and only then invokes `admin_mutate_event_pass` through a service-role server client. The admin panel's create/suspend/reactivate pass actions call this route instead of the old self-service RPC or a direct client-side `passes` table update.

This mirrors the existing `apps/mobile-app/app/api/qr/admin+api.ts` pattern (authenticate → authorize → rate-limit → privileged service-role call) rather than inventing a new one.

## Known limitations (as of this writing)

- **The Admin Panel's entry gate is still global-only.** `checkAdminAccess()` in `admin.tsx` still checks the old global `isAdmin()`, so a user granted `event_admin`/`moderator` via `event_roles` has no way to reach the admin UI yet — today the new role only matters to `/api/admin/passes` directly.
- No `/api/admin/events` or `/api/admin/roles` routes exist yet — populating `event_roles` currently requires a direct database write.
- No speaker/agenda/venue CRUD UI or API yet, despite the tables existing.
- No RLS policy lets an event-scoped-only admin (not a global admin) read the `passes` table directly — the admin panel's pass list still relies on the pre-existing `passes_admin_all` policy, which is global-admin-only.
- `packages/config/src/events.ts` is not retired — it remains the fallback source for anything not yet imported into `events`.

See `.agents/active/task-admin-event-control-center.md` for the full phased delivery plan.
