# Event-Scoped API Client Routing

Shared event capabilities use an event ID in the URL. This keeps their
contracts reusable for every event and prevents a tenant-specific route from
selecting the wrong event.

## API ownership

| Scope | Route convention | Use for |
| --- | --- | --- |
| Shared event feature | `/api/events/:eventId/:feature` | Agenda, meeting requests, availability, and scheduling |
| BSL-only feature | `/api/bsl/:feature` | BSL-specific speakers, bookings, and integrations |
| Global feature | `/api/:feature` | Auth and other product-wide APIs |

The route's `:eventId` is authoritative. Server handlers must derive the
event from the URL and use it for every event-owned query and mutation; a
query parameter or request body cannot select another event.

## Shared scheduling endpoints

| Method | Endpoint |
| --- | --- |
| `OPTIONS`, `GET` | `/api/events/:eventId/agenda` |
| `GET`, `POST` | `/api/events/:eventId/agenda/status` |
| `GET`, `POST`, `PATCH` | `/api/events/:eventId/meetings/requests` |
| `GET` | `/api/events/:eventId/meetings/requests/slots` |

Use the shared routes for new event scheduling features. Keep an endpoint
under `/api/bsl` only when its behaviour or integration is truly BSL-only.

Meeting-request records, agenda status, and pending demand are scoped by the
path event ID today. The slot provider still uses the current BSL availability
adapter, so a new event must provide an event-aware availability provider
before enabling that endpoint for its speakers.

## Calling a shared event API

Build the path explicitly with `eventApiPath()` and bypass tenant route
resolution. This works from event pages and global components alike.

```ts
import { apiClient, eventApiPath } from '@/lib/api-client';

const path = eventApiPath(eventId, 'meetings/requests');

await apiClient.request(path, {
  skipEventSegment: true,
  method: 'POST',
  body: { speakerId, speakerName, requesterName, message },
});
```

Do not derive a shared-feature URL from `event.api.basePath` or pass an event
ID as a parameter to choose its route. `eventApiPath()` validates the ID and
forms `events/:eventId/:feature`; the server validates the same route value.

## Breaking route migration

This rename has no compatibility alias. Update every mobile client, test,
proxy, and integration in the same release.

| Previous route | Replacement |
| --- | --- |
| `/api/bslatam/agenda` | `/api/events/:eventId/agenda` |
| `/api/bslatam/agenda-status` | `/api/events/:eventId/agenda/status` |
| `/api/bslatam/meeting-requests` | `/api/events/:eventId/meetings/requests` |
| `/api/bslatam/meeting-requests/slots` | `/api/events/:eventId/meetings/requests/slots` |
| Other BSL-only `/api/bslatam/:feature` routes | `/api/bsl/:feature` |
