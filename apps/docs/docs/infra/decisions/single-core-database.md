---
title: "Decision: one core database for every tenant and event"
---

# Decision: one core database for every tenant and event

**Date:** 2026-10-20 · **Status:** accepted; data copy rehearsed, production
copy and routing cutover pending (see [Status](#status))

## Decision

Core production (`fxgftanraszjjyeidvia`, us-east-2) is the only production
database for every tenant and event. The BSL production project
(`mnnqryrdlhddorqsrtbn`, us-west-2) becomes a **read-only backup** of the data
it held at the cutover. It receives no writes and no further migrations.

## Why

Both projects held the same six events with different data underneath, and the
app chose a database per request host. A speaker page read `bsl_speakers` from
one database while the booking RPC, the passes and the request insert ran on
the other. The visible failure was `speaker_not_found` for every speaker when a
General-pass holder tried to book a meeting; the underlying problem was that
"which database owns this event?" had no single answer. Keeping two production
databases also meant every migration, trigger and RPC fix had to be applied and
verified twice, and the two schemas had already drifted (`bsl_speakers`,
`meetings.speaker_id`, Better Auth tables, pending-speaker eligibility).

## What moved

* **Schema:** V123 (pending-speaker eligibility in `can_make_meeting_request`)
  and V124 (event-scoped `bsl_speakers` shape) bring core to the BSL shape. Both
  are in the `core-production` profile group list.
* **Data:** V125 copies the BSL-only rows (speakers, agenda, passes, meeting
  requests, slots, chat, roles, claims, notifications, Better Auth store and the
  user registry). It is run by hand once, after staging the BSL snapshot; see
  `packages/tools/scripts/consolidate-bsl-into-core.md`.
* **Identity:** the same email on both sides resolves to the **core** account;
  BSL-only people keep their ids. Nothing is invented for passes with no owner.

## Consequences

* New events, tenants and migrations target `core-production` only. The
  `bsl-production` migration profile is retired.
* The BSL project stays until the owner decides to delete it; treat it as a
  backup, not a source of truth. Do not point any service at it.
* Better Auth lives on core, so the Lambda's `BETTER_AUTH_DATABASE_URL`,
  `DATABASE_URL` and `SUPABASE_DB_URL` must point at core after cutover.
* Shared dev (`gsugeqozyeokncpbndna`) is unchanged.

## Status

* Rehearsed on a restored copy of core plus the staged BSL snapshot: the copy
  completes, no row points at a missing account, and `can_make_meeting_request`
  returns `allowed` for Nagel Paulino and Edward Calderón for General-pass
  holders from both databases.
* Done: production data copy (V125, verified on core).
* In the release pipeline: host/event routing to `core-production`, the retired
  `bsl-production` profile, and the Lambda database URL switch (applied by
  `deploy-api-lambda.sh` from the `API_LAMBDA_DATABASE_URL_PROD` secret).
* After the deploy is verified: drop the `bsl_import` and `bsl_import_auth`
  staging schemas on core, then change this status to **done**.
