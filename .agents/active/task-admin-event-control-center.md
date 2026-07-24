# Admin Event Control Center

**Priority:** High
**Status:** In progress (foundation and pass-management repair)

## Goal

Replace the global-only, hardcoded event administration model with an event-scoped control plane. Global `super_admin` and `admin` assignments remain in `user_roles`; `event_admin` and `moderator` assignments belong to a specific event.

## Decisions

- Global `super_admin` and `admin` roles imply administrative access to every event.
- An `event_admin` may grant and revoke `moderator` for the same event, but may not grant `event_admin`.
- A `moderator` may perform operational moderation but may not manage roles, event metadata, passes, speakers, or agenda content.
- Event configuration keeps a TypeScript fallback during migration. Database event rows are the mutable source once an event has been imported.
- Administrative pass mutations run only on a privileged server route. Browser clients must never receive service-role credentials or call a caller-controlled `SECURITY DEFINER` minting function.
- Every privileged mutation must write an append-only audit record containing actor, event, action, target, and non-secret metadata.

## Schema

1. `events`: mutable event identity, schedule, venue, branding, and publication state.
2. `event_roles`: per-event `event_admin` and `moderator` assignments.
3. `event_agenda_items`: ordered, event-scoped agenda content.
4. `speakers`: generalized per-event speakers, with an optional link to an authenticated user.
5. `admin_action_log`: append-only privileged-action audit trail.
6. Add a staged (`NOT VALID`) foreign key from `passes.event_id` to `events.id` so legacy data can be reconciled before validation.

## Backend surfaces

- Event authorization helper: global admins are authorized everywhere; otherwise require an event role.
- `/api/admin/passes`: create, revoke/reactivate, and upgrade/downgrade event passes through the service-role server client.
- Follow-up routes: events, event roles, agenda, speakers, attendees, and audit-log queries.

## Frontend surfaces

- Repair the existing Admin Panel pass workflow to use `/api/admin/passes` rather than `create_default_pass` or direct pass-table updates.
- Add event selection and permission-aware navigation.
- Add event details/venue, agenda, speakers, team, attendees/passes, and audit-log screens.

## Security acceptance criteria

- Deny unauthenticated requests with 401 and insufficient event scope with 403.
- Validate identifiers and enum-like inputs before database calls.
- Derive the audit actor from the authenticated request, never from request JSON.
- Keep role grants constrained by event and grantor authority.
- Do not expose secrets, session tokens, or private user metadata in audit records or logs.
- Apply RLS to all new tables and keep writes server-controlled.

## Delivery plan

- [x] Record role/permission decisions and phased migration plan.
- [x] Add the event-control schema foundation and seed known configured events.
- [x] Add a privileged, event-authorized pass mutation route with audit logging.
- [x] Move the current Admin Panel create/status mutations to the server route.
- [ ] Add event/role CRUD routes and UI.
- [ ] Add agenda and speaker CRUD routes and UI.
- [ ] Import all TypeScript event metadata and reconcile legacy pass event IDs.
- [ ] Validate the staged pass/event foreign key after reconciliation.
- [ ] Add attendee search, bulk operations, dashboards, and audit-log UI.
