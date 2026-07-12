# Event-Scoped API Client Routing

## Overview

`apps/mobile-app/lib/api-client.ts` exposes a single `apiClient.request(path, options)`
used across the app to call the Expo Router API (`api.hashpass.tech` /
`api-dev.hashpass.tech`). For event-specific endpoints (agenda, speakers,
networking, etc.) the client automatically prefixes the request with an
event-specific URL segment, e.g. `/api/bslatam/agenda` for the BSL event.

This doc explains how that segment gets resolved, a routing bug that shipped
in v1.8.204 as a result of it, and how to call the client correctly from
components that may render outside an event-scoped route.

## How the URL segment is resolved

`apiClient.request()` calls `getCurrentEvent()` (from `lib/event-detector.ts`)
to figure out which event's API config to use:

```ts
const event = getCurrentEvent(options.eventId);
```

`getCurrentEvent(eventId?, hostname?)`:

- **With an explicit `eventId`** — looks the event up directly by id from the
  available events list. Deterministic, works anywhere.
- **Without an `eventId`** — falls back to hostname/tenant detection
  (`bsl.hashpass.tech` → `bsl`, `peru2026.hashpass.tech` → `peru2026`, etc.)
  and, for routes under `/events/[eventSlug]/...`, the route's slug. This
  only works when the calling code is actually rendered on an event-scoped
  route or subdomain.

The resolved event (or `null`) then feeds `getEventApiSegment()`, which
extracts the segment from `event.api.basePath` (e.g. `/api/bslatam` →
`bslatam`) or **falls back to the literal string `'default'` when there is no
resolved event**. There is no `/api/default/...` route for most endpoints
(agenda included) — hitting it is a guaranteed 404.

## The v1.8.204 bug

`AgendaTracker` (a "live now" widget) is rendered in two contexts:

1. Inside actual event pages (`/events/[eventSlug]/agenda.tsx`), where route
   detection correctly resolves the event.
2. Inside `EventBannerCarousel`, shown on the **home page** promo carousel —
   not an event-scoped route.

In context (2), `EventBanner` didn't pass an `eventId` prop through to
`AgendaTracker`, and `AgendaTracker`'s own fetch call didn't pass one to
`apiClient.request()` either. Combined with the home page having no route to
detect an event from, every mount resolved to the `'default'` segment and
404'd against `/api/default/agenda?eventId=bsl`. The client's retry logic
also retried this guaranteed-to-fail 404 (it only skipped retries for
timeouts/aborts), so the home page generated a growing, unbounded stream of
failing requests — reported as an "infinite loop" against production.

## The fix

- `ApiRequestOptions` gained an `eventId` field that flows straight into
  `getCurrentEvent(options.eventId)`, so callers outside event-scoped routes
  can resolve the correct segment explicitly instead of relying on route
  detection.
- `AgendaTracker` now passes its `eventId` prop through via this option.
- `EventBannerCarousel` now passes `eventId={event.id}` to each slide's
  `EventBanner`, so the right event's agenda loads instead of always
  defaulting to `'bsl'`.
- `apiClient.request()`'s retry logic now skips retries for non-retryable 4xx
  responses (everything except `408` and `429`) — a bad route or bad request
  will never succeed just by retrying it, so retrying only multiplies load
  for no benefit.

## Guidance for new event-aware components

If a component that calls `apiClient.request()` for an event-specific
endpoint might ever be rendered **outside** an event-scoped route (a global
page like the home page, a shared dashboard widget, etc.), pass `eventId`
explicitly:

```ts
await apiClient.request('agenda', {
  params: { eventId },
  eventId, // resolves the API segment directly, bypassing route detection
});
```

Don't rely on `getCurrentEvent()`'s implicit route/hostname detection unless
the component is only ever rendered on that event's own route.
