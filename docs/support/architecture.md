# HashPass Support Architecture and Gap Report

_Last audited: 2026-08-06. Baseline: `origin/develop` at `d7788113` (`chore: release v1.8.326`), Phase 2 backend added on top of the Phase 1 client foundations below._

## What exists now

- `@hashpass-tech/sdk` is the canonical framework-neutral customer contract with `HashpassClient`, `SupportClient`, auth/session plumbing, idempotency headers, retry behavior, and cursor polling. `HashpassAuth.adoptSupportSession()` bridges a `SupportSession` (returned by `createSupportSession`/`identifySupportVisitor`) into the same bearer-token store used for every other authenticated call, so a visitor's session actually carries through to `listTickets`/`sendMessage`/etc. `ENVIRONMENT_URLS` resolves to `.../api/`, matching every other tenant's `apiBaseUrl` convention in this repo (`packages/config/src/sso-config.ts`).
- `@hashpass-tech/sdk-cli` exposes the backward-compatible `support create|list|show|reply|handoff|resolve` commands plus `support widget init|show` and `support doctor`.
- `apps/mobile-app/app/api/v1/support/*`, `.../v1/integrations/kapso/*`, and `.../v1/admin/support/*` are real Lambda route handlers (Expo Router `+api.ts`), backed by `db/migrations/V065__support_system.sql` (tables: `support_visitors`, `support_sessions`, `support_tickets`, `support_messages`, `support_ticket_reads`, `support_idempotency_keys`, `support_kapso_inbound_events`, plus the RPCs each route calls). Applied and round-trip verified on dev; see the migration file's own header comments for the RLS/authorization model (service-role-only access, no `auth.uid()`-based policies, since visitors authenticate with an opaque support-session bearer token rather than a Supabase JWT).
- `@hashpass/support-widget` (Web Component), `@hashpass/support-react`, and `@hashpass/support-react-native` are real, working clients against the routes above: the widget bootstraps a session on connect (persisted in `localStorage`, survives a reload), shows the actual message thread, and lets a visitor reply on an existing ticket -- not just file a single message.
- `@hashpass/support-kapso` provides HMAC-SHA256 signature helpers, timing-safe verification, `X-Idempotency-Key` normalization, sensitive payload redaction, and 24-hour window routing primitives. The webhook route (`v1/integrations/kapso/webhook+api.ts`) verifies the raw request body against `KAPSO_WEBHOOK_SECRET` and durably persists every accepted (and deduplicated) delivery to `support_kapso_inbound_events`.

## What is still deliberately not built

This is the same phase boundary the Phase 1 branch called out, now narrowed to what's left:

- **No outbound Kapso send / no background worker.** This repo has no queue or job-runner infrastructure anywhere (confirmed by a full repository audit before writing the migration/routes). `support_kapso_inbound_events` rows are persisted with `processed = false` and never advanced -- there is nothing yet that reads them and calls out to Kapso. Building that worker is separate infrastructure work, not a route-handler-sized change.
- **No AI draft generation or approval state machine.** `/v1/admin/support/tickets/{id}/drafts` and `/drafts/{id}/approve|reject` in `openapi.yaml` remain contract-only. This needs an AI provider decision this repo hasn't made yet, and an approval UI, which brings us to:
- **No admin UI.** `/v1/admin/support/tickets` (list) and `/v1/admin/support/tickets/{id}` (detail, with messages) are real, `authorizeGlobalAdmin`-gated, read-only endpoints -- ticket data is inspectable and scriptable today -- but there is no screen in `apps/mobile-app` that calls them yet, and no assignment/claim endpoint.
- **No real-time signals.** The cursor-polled event feed (`GET /v1/support/tickets/{id}/events`) only ever emits `message.created` and `ticket.updated`, derived live from the two source tables. `agent.joined` and `typing.*` from the SDK's `SupportEvent` union are never emitted -- there's no presence/typing signal to source them from.
- **Anonymous ticket creation has no captcha gate.** `CreateTicketInput` (the frozen Phase 1 SDK contract) has no captcha-token field, and the widget has no challenge-solving UI. Abuse mitigation for `POST /v1/support/tickets` and message sends is IP + per-visitor rate limiting only (`lib/bsl/rateLimit.ts`, 5/min per key) -- a real gap, not a silent omission.
- **No merge-on-identify.** Calling `identifySupportVisitor` after an anonymous session mints a new/matched visitor by email or external ID, but does not reassign an existing anonymous visitor's prior tickets to the identified one.

## Backend implementation (what actually shipped)

Matches the plan from the Phase 1 branch, items 1-3 fully, item 5 partially (verify + durably persist, no processing), items 4 and 6 explicitly deferred per above:

1. **Schema + RLS**: `db/migrations/V065__support_system.sql`. Tables are RLS-enabled with no public policies (service-role-route-only access), following the `user_schedule_shares` precedent (`V058`) rather than the `auth.uid()`-keyed pattern used elsewhere in this codebase -- support visitors are not Supabase auth users.
2. **Route handlers**: `apps/mobile-app/app/api/v1/support/{sessions,widget-config,tickets,tickets/[ticketId],tickets/[ticketId]/{messages,events,read,handoff}}+api.ts`, `v1/integrations/kapso/{webhook,health}+api.ts`, `v1/admin/support/tickets{,/[ticketId]}+api.ts`. `v1/` is the first versioned route segment in this app; the SDK's default `baseUrl`s were fixed to include `/api/` to match.
3. **Tenant isolation**: `app_id` is a plain text column (no tenant table exists in this repo), validated against a static allow-list (`apps/mobile-app/lib/server/support-apps.ts`) that mirrors `SSO_CONFIG.tenants`' slugs. Every mutation is additionally scoped by `visitor_id`, resolved from the caller's support-session bearer token (`apps/mobile-app/lib/server/support-session.ts`) -- verified with a real cross-visitor isolation test on dev (visitor A cannot read or write visitor B's ticket) before any route code was written against it.
5. **Kapso webhook**: raw-body HMAC verification (`request.text()` before any JSON parsing -- verifying a re-serialized body would silently break on key-order/whitespace differences from what Kapso actually signed), idempotent persistence via a unique constraint on `idempotency_key`.

## Kapso documentation verification

Kapso docs checked on 2026-08-05 state that webhooks use HMAC-SHA256 in `X-Webhook-Signature`, use `X-Idempotency-Key` for deduplication, and the TypeScript SDK can target `https://api.kapso.ai/meta/whatsapp`.
