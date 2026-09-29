# Event source ingestion

HashPass event ingestion converts public partner event metadata into the normalized feed used by event discovery, host pages, agendas, networking, passes, and check-in surfaces.

## Hash Poker Room

PKRR / Hash Poker Room is modeled as a permanent weekly Medellín community host rather than a conference. Its event experience supports the weekly agenda, the next occurrence, public seat-reservation links, member identity, networking, and QR check-in. Speaker and conference-session expectations remain disabled.

PKRR remains responsible for poker identity and player profiles. HashPass supplies event discovery, smart passes, landing-page distribution, networking, event check-in, benefits, attendance history, and community activation. The integration does not provide betting, wagering, casino payments, prize accounting, or private player-data ingestion.

## Data flow

1. `@hashpass/event-ingestion` checks public robots directives and fetches the PKRR community page.
2. The adapter parses the public Next.js-rendered timeline with a standards-based HTML parser and validates normalized records with Zod.
3. Successful synchronization retains missing events as `stale` for review instead of deleting them.
4. Stale and cancelled events are excluded from the active landing and host configuration.
5. A scheduled workflow persists observations and safe normalized updates to PostgreSQL; risky changes enter a review queue.
6. The API reads the RLS-filtered published-event view. The checked-in snapshot and automation PR are explicitly retained as a legacy fallback during migration only.

## BSL Colombia 2026 programme

The official Colombia page is parsed as static semantic HTML. Speaker names,
roles, organizations, categories, portraits, and all three agenda days are
validated before any write. Portrait downloads accept only bounded PNG, JPEG,
or WebP payloads from the allow-listed source host and are stored under
content-hashed CDN keys. Database reconciliation runs through one
service-role-only transaction, is scoped by `event_id`, deactivates only
source-managed speakers that disappear, and removes only source-managed agenda
rows that disappear.

The scheduled workflow polls hourly before the event and every five minutes
during November 4–6, 2026. Development and production are independent matrix
targets; one failure cannot silently select the other database. AWS uploads
also require the caller account to match `EXPECTED_AWS_ACCOUNT_ID` before the
first mutation.

## Operator commands

```bash
npm run sync:events
npm run sync:bsl-colombia
npm run sync:bsl-colombia:dev
npm run sync:bsl-colombia:prod
npm run test:event-ingestion
pnpm --filter @hashpass/event-ingestion typecheck
```

The primary normalized feed is stored in PostgreSQL by `V082__database_event_source_ingestion.sql`. Sync health is written both to the durable sync-run table and to `artifacts/event-ingestion/health.json` for job diagnostics. Set `EVENT_INGESTION_LEGACY_JSON_FALLBACK=true` only to retain the checked-in snapshot fallback.

Review records marked `needsReview`, records below the configured confidence threshold, and retained `stale` records. Do not hand-edit generated event data; correct the source adapter or upstream public metadata and rerun synchronization.

For adapter architecture, source-strategy examples, PKRR research, compliance boundaries, and roadmap details, see the repository engineering guide at `docs/event-ingestion.md`.
