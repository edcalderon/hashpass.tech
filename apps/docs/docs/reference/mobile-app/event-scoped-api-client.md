# Event-Scoped API Client Routing

Use this as the compact client integration and route-migration guide. For the
route ownership contract, request lifecycle, data isolation, and operational
checks, see [Event API Architecture](event-api-architecture.md).

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

## Route migration

This rename has no compatibility alias. Update every mobile client, test,
proxy, and integration in the same release.

| Previous route | Replacement |
| --- | --- |
| `/api/bslatam/agenda` | `/api/events/:eventId/agenda` |
| `/api/bslatam/agenda-status` | `/api/events/:eventId/agenda/status` |
| `/api/bslatam/meeting-requests` | `/api/events/:eventId/meetings/requests` |
| `/api/bslatam/meeting-requests/slots` | `/api/events/:eventId/meetings/requests/slots` |
| Client Supabase speaker lookups | `/api/events/:eventId/speakers` and `/api/events/:eventId/speakers/:speakerId` |
| Client meeting-limit RPC | `/api/events/:eventId/meetings/limits` |
| Other BSL-only `/api/bslatam/:feature` routes | `/api/bsl/:feature` |
