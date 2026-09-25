# HashPass Support system: Phase 2 backend

Shipped in PR #168 (two passes): a first commit added client-only
foundations (SDK extensions, the `@hashpass/support-widget` Web Component,
`@hashpass/support-kapso`, CLI commands, an OpenAPI draft) with **no backend
behind them at all** — every `/v1/support/*` call would 404. A second pass
on the same PR added the real backend so the widget/SDK/CLI actually work.
The exhaustive, kept-current version of this document is
[`docs/support/architecture.md`](../../../../../docs/support/architecture.md)
at the repo root, alongside [`docs/support/openapi.yaml`](../../../../../docs/support/openapi.yaml) —
this page is the pointer into the docs site.

## What's real

- **Schema**: `db/migrations/V065__support_system.sql` — visitors, sessions,
  tickets, messages, per-visitor read cursors, an `Idempotency-Key` replay
  table, and a Kapso inbound-webhook events table. Applied to both dev and
  prod. RLS is enabled with no public policies (service-role-route-only
  access) because support visitors authenticate with an opaque
  support-session bearer token, not a Supabase `auth.uid()`.
- **Routes**: `apps/mobile-app/app/api/v1/support/*`,
  `v1/integrations/kapso/*`, `v1/admin/support/*` — the first `v1/`-prefixed
  routes in this app. Tenant isolation is a static app-id allow-list
  (`lib/server/support-apps.ts`, mirroring `SSO_CONFIG.tenants`' slugs; this
  repo has no tenant/application registry table), and every mutation is
  additionally scoped by the caller's resolved `visitor_id` — verified with
  a real cross-visitor isolation check on both dev and prod before any route
  code was written against it.
- **Kapso webhook**: raw-body HMAC verification before any JSON parsing (a
  re-serialized body would silently fail signature verification), persisted
  idempotently. It does **not** process or reply to anything yet — this repo
  has no background-job/queue infrastructure anywhere, so that's future work.
- **Widget**: `@hashpass/support-widget` now bootstraps and persists a
  session (survives a reload) and renders/replies to the real message
  thread, instead of firing one message with no way to see a response.

## Two real SDK bugs fixed along the way

1. `packages/sdk/src/client.ts`'s `ENVIRONMENT_URLS` was missing the `/api/`
   path segment every other tenant `apiBaseUrl` in this repo uses
   (`packages/config/src/sso-config.ts`, `lib/api-client.ts`, etc.) — as
   shipped, the SDK's default URLs would never have matched a route placed
   under `apps/mobile-app/app/api/...`.
2. `SupportSession.token` (returned by `createSupportSession`/
   `identifySupportVisitor`) was never adopted into the transport's bearer
   auth store, so every call after establishing a session went out
   unauthenticated. Fixed with `HashpassAuth.adoptSupportSession()`.

## What's still not built

AI draft generation + approval, outbound Kapso sending (needs the worker
infra above), an admin UI (the read-only admin ticket-list/detail API is
real and gated by `authorizeGlobalAdmin`, just unused by any screen yet),
realtime `agent.joined`/`typing.*` signals, and a captcha gate on anonymous
ticket creation (the SDK's frozen `CreateTicketInput` contract has no field
for one). See `docs/support/architecture.md` for the full, current list —
it's the source of truth, this page is a summary that will drift.
