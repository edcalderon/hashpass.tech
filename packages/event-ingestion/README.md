# Event source ingestion

## Purpose and boundaries

Event ingestion turns **public event metadata** into a common HashPass event feed. It is an event discovery, identity, pass, check-in, networking, attendance, and benefits layer. It does not ingest private member information and must not implement betting, wagering, casino payments, prize accounting, or other regulated gaming functions.

For Hash Poker, PKRR remains the poker identity/player-profile system. HashPass complements it with landing-page distribution, a weekly smart pass, RSVP/seat-reservation links, QR check-in, networking, benefits, attendance history, and verified participation records. Future badges or rankings must use partner-approved, verified data rather than inferred results.

## Architecture

`packages/event-ingestion` contains five small layers:

1. **Registry/schema** — `EventSource`, health, recurrence, and the Zod-validated normalized event contract.
2. **Detector** — inspects public HTML, robots directives, sitemap declarations, JSON-LD, Next/Nuxt hydration, RSS/iCal links, public API URL candidates, and assets.
3. **Adapters** — PKRR's Next-rendered public timeline and a generic Schema.org `Event` JSON-LD parser. A future adapter may use a documented API, RSS/iCal, static HTML, or Playwright.
4. **Normalizer/quality** — stable `sourceId + externalId` identity, ISO dates, confidence, review flags, raw public payload, recurrence, and deduplication.
5. **Sync** — fetches active sources, validates before replacing data, atomically writes the snapshot, retains missing records as stale/reviewable instead of deleting them, and writes machine-readable health.

The checked-in snapshot at `packages/config/src/generated/ingested-events.json` feeds `getHashPokerEventConfig()`. The event registry therefore supplies the normal `getAvailableEvents()` path used by the global carousel; the UI does not parse or hardcode PKRR HTML. At runtime the helper rolls a recurring source date forward by whole weeks and chooses the nearest occurrence.

## Normalized mapping

| Source | HashPass |
| --- | --- |
| PKRR registration slug | `externalId`, stable `id` |
| Timeline title/body | `title`, `description` |
| Canonical RSC day + displayed time | `startsAt` in `America/Bogota` |
| Timeline venue | `venueName`; public community metadata supplies Medellín/Provenza |
| Cover/registration URL | `coverImage`, `sourceUrl`, `Reserve seat` CTA |
| Weekly timeline pattern | weekly `recurrence` and next-occurrence resolution |
| Community host | `Hash Poker Room` organizer |

PKRR items become `poker_room_event` or `community_tournament`, with agenda, networking, and check-in enabled. `speakers` is deliberately empty, and the host's quick-access menu has no speaker tile. The app exposes the host through `/events/hash-poker/home`, the existing agenda/networking/wallet/check-in concepts, and the source CTA. Advanced RSVP/waitlist, attendance proof, badges, and ranking hooks remain later partner-backed phases.

## PKRR / Hash Poker research (2026-08-14)

Only public, unauthenticated responses were inspected.

* `https://pkrr.io/c/hash-poker` is a server-rendered Next.js App Router page. It exposes the current public tournament timeline in HTML and React Server Component hydration (`self.__next_f`), including canonical date keys, registration slugs, descriptions, venue names, covers, and public registration links.
* It has OpenGraph/Twitter community metadata and images. No JSON-LD Event block, RSS, iCal, public GraphQL endpoint, or documented event API was found. Static page/chunk inspection revealed no superior public event endpoint, so the adapter uses the server-rendered HTML rather than private browser calls.
* `robots.txt` was available and contained content-signal commentary but no user-agent/path prohibition for the community page. `/sitemap.xml` returned 404. Every sync rechecks robots before parsing.
* `https://hash.poker` was a static public community/venue site with normal metadata and a local `js/main.js`; `/robots.txt` and `/sitemap.xml` returned the same HTML rather than machine-readable files. It is supporting organizer/location context, not the canonical changing schedule.
* Public inspection found the PKRR profile at El Poblado, Medellín and a current weekly timeline. Member counts and registrant lists are not ingested. HashPass links back to the public registration page and does not reproduce PKRR payment/gameplay capabilities.

Because there is no documented API, the default is a lightweight HTML poll every 60 minutes. Operators should use 6–12 hours if origin load or policy requests warrant it. Fetches have no credentials, parsing is schema-validated, failed fetches retain the last snapshot, and absent items become stale rather than being silently deleted.

## Run and operate

```bash
npm run sync:events
npm run test:event-ingestion
pnpm --filter @hashpass/event-ingestion typecheck
```

Run `npm run sync:events` from cron or a scheduled CI runner. It writes:

* normalized public events: `packages/config/src/generated/ingested-events.json`;
* operational health: `artifacts/event-ingestion/health.json` (runtime artifact, not product data).

Recommended schedule is hourly for the lightweight PKRR page, with exponential scheduling/backoff supplied by the job runner after failures. A `failed` health state means no usable prior snapshot; `degraded` means the source failed but retained data remains. Alert on repeated degraded/failed status or a stale `lastSuccessfulSync`.

The scheduled workflow persists successful changes by opening or updating the `automation/event-source-sync` pull request against `develop`; the application never depends on a disposable workflow artifact. The artifact remains available for diagnostics. Repository protections and normal review/deployment checks therefore apply before a refreshed snapshot reaches users.

Stale events remain in the snapshot for audit and manual review, but the active Hash Poker host configuration explicitly excludes both `stale` and `cancelled` records. Missing tournaments can therefore never be rolled forward into a landing card or active agenda.

Review any event with `needsReview: true`, `confidence < 0.75`, `status: stale`, a changed date, or an unexpected venue. Compare its preserved `sourceUrl` and `rawPayload` with the public page. Correct the adapter/fixture or source data; do not hand-edit generated records. Deletion remains a manual product decision.

## Add another source

1. Register an `EventSource` with a respectful interval and parser strategy.
2. Check robots and sitemap before fetching content.
3. Prefer a documented public API. Validate its response and map it to `normalizedEventSchema`.
4. Otherwise prefer JSON-LD, iCal, or RSS, then server-rendered static HTML. Use Playwright only for a truly dynamic public page and capture only allow-listed public event responses.
5. Preserve stable external IDs, source URL, raw payload, confidence, and review status.
6. Add sanitized fixtures and tests for missing fields, bad dates, dedupe, recurrence, and failures.
7. Add the source to the sync registry and map normalized output to a reusable app/landing config.

### Strategy examples

* **Static HTML:** select stable semantic attributes/classes, cache responses, and fail closed when the expected event collection disappears.
* **JSON-LD:** pass the page to `parseJsonLdEvents`; support `Event` nodes in a root object, array, or `@graph`.
* **API:** fetch only a documented public endpoint, validate its payload, honor cache headers/rate limits, and retain its canonical IDs.
* **Dynamic JavaScript:** an optional Playwright adapter may listen for public event JSON while loading the page. It must check robots first, cap navigation/time/response size, and never persist cookies or private responses.
* **Weekly recurrence:** retain the source occurrence and recurrence rule. Landing output calls `resolveNextOccurrence` so an old weekly date is never displayed as the next event.

## Roadmap

Phase 1 is the live public adapter, normalized snapshot, permanent host, and landing card. Phase 2 can persist RSVPs/waitlists, smart-pass check-ins, attendance, reminders, and proof of participation through existing HashPass services. Phase 3 can add a registry-backed Playwright detector and a manual-review dashboard. Phase 4 can add partner-approved benefits, seasonal badges, and verified ranking links. None of these phases should ingest private PKRR player data or create money/game/prize features without explicit compliance approval.
