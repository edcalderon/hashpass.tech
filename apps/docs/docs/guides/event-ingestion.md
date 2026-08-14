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
5. A scheduled workflow opens or updates an automation pull request when the checked-in event snapshot changes, so repository review and deployment protections apply.

## Operator commands

```bash
npm run sync:events
npm run test:event-ingestion
pnpm --filter @hashpass/event-ingestion typecheck
```

The normalized snapshot is written to `packages/config/src/generated/ingested-events.json`. Sync health is written to `artifacts/event-ingestion/health.json` for diagnostics.

Review records marked `needsReview`, records below the configured confidence threshold, and retained `stale` records. Do not hand-edit generated event data; correct the source adapter or upstream public metadata and rerun synchronization.

For adapter architecture, source-strategy examples, PKRR research, compliance boundaries, and roadmap details, see the repository engineering guide at `docs/event-ingestion.md`.
