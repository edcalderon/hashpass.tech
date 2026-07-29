---
title: Event API Architecture
---

# Event API Architecture

Event scheduling capabilities are reusable across events. Their URL identifies
the event; BSL branding and adapters do not belong in a shared capability's
public route.

## Route ownership

| Scope | Route convention | Appropriate use |
| --- | --- | --- |
| Global | `/api/:feature` | Product-wide capabilities such as authentication and notifications |
| Shared event | `/api/events/:eventId/:feature` | Reusable event capabilities such as agenda and meeting scheduling |
| BSL-only | `/api/bsl/:feature` | BSL-specific speakers, bookings, and integrations |

Keep a feature under `/api/bsl` only when its behavior or provider is genuinely
specific to BSL. New reusable event features belong below `/api/events/:eventId`.

## Shared scheduling contract

| Methods | Endpoint | Responsibility |
| --- | --- | --- |
| `OPTIONS`, `GET` | `/api/events/:eventId/agenda` | Read agenda sessions for one event |
| `GET`, `POST` | `/api/events/:eventId/agenda/status` | Read or update the caller's session status and favorites |
| `GET` | `/api/events/:eventId/speakers` | Read the event speaker directory for agenda and search |
| `GET` | `/api/events/:eventId/speakers/:speakerId` | Read one speaker profile |
| `GET` | `/api/events/:eventId/meetings/limits` | Read the caller's meeting-request allowance |
| `GET` | `/api/events/:eventId/networking/stats` | Read the caller's event-scoped networking dashboard statistics |
| `GET`, `POST`, `PATCH` | `/api/events/:eventId/meetings/requests` | List, create, and act on a meeting request |
| `GET` | `/api/events/:eventId/meetings/requests/slots` | Load availability with event-scoped pending-demand metadata |

`eventId` in the path is authoritative. It is validated and normalized by the
server from `/api/events/:eventId`; a query parameter or request body cannot
select another event. Invalid or missing IDs receive `400`. Queries and writes
that own event data must include that path ID, and a lifecycle action first
checks that the target request belongs to it. This prevents cross-event reads
and mutations even when a client sends conflicting input.

The meeting-limits route forwards that validated ID to the count provider as
an explicit argument. Provider functions must not fall back to a session
setting or default event, because RPC calls do not carry that ambient context.

`POST /meetings/requests` accepts whole durations from **5 to 30 minutes**.
The API rejects invalid values before calling the provider, and the
meeting-request table enforces the same range as a database backstop.

## Scheduling lifecycle

1. **Agenda** reads `event_agenda` for the path event ID. Agenda-status reads
   and upserts the authenticated user's `user_agenda_status` for that same ID.
2. **Meeting requests** list outgoing and incoming requests within the event.
   Creation passes the path ID to the request lifecycle contract.
3. **Request actions** (`accept`, `decline`, `cancel`, or `block`) verify the
   request's event before invoking the authorized lifecycle operation. A
   successful acceptance creates the confirmed meeting and its attendee and
   speaker agenda entries through the meeting lifecycle.
4. **Request slots** load speaker availability and then enrich it only with
   pending requests from the path event. Capacity is reported as `open`,
   `tentative`, or `hot`; a hot slot has three or more pending requests.

Two provider adapters are currently BSL-specific. Meeting-request lists and
speaker actions resolve the caller through `bsl_speakers`, and the slot
provider calls `get_speaker_available_slots`. The route and event-owned data
are event-scoped, but another event must supply both an event-aware speaker
identity/participant adapter and an availability adapter before enabling the
full request and slot flow for its speakers.

## Mobile integration

Build shared paths explicitly. `skipEventSegment` prevents the general client
from prepending a tenant-specific route such as `/api/bsl`.

```ts
import { apiClient, eventApiPath } from '@/lib/api-client';

const path = eventApiPath(eventId, 'meetings/requests');

await apiClient.request(path, {
  skipEventSegment: true,
  method: 'POST',
  body: { speakerId, speakerName, requesterName, message },
});
```

Do not build a shared-feature URL from `event.api.basePath`, and do not use
`apiSegment` for a shared event feature. The short client migration guide is
[Event-Scoped API Client Routing](event-scoped-api-client.md).

The mobile client must not query Supabase tables or RPCs directly for this
flow. Speaker profiles, speaker-directory search, request limits, requests,
availability, and networking statistics are all read through these backend routes. This keeps client
code independent of the current database provider and prevents schema or
tenant-routing failures from leaving a screen in a loading state.

## Rollout and operations

This route migration is intentionally breaking: `/api/bslatam/...` has no
compatibility alias. Migrate mobile callers, proxies, tests, and integrations
in one release; BSL-only routes move to `/api/bsl/...` and shared features move
to `/api/events/:eventId/...`.

Before enabling a new event, verify that its agenda and meeting-request data
are keyed by its event ID, the meeting-request database contract accepts that
ID, and event-aware speaker identity and availability adapters exist. Smoke-test
the CORS preflight and authenticated read/create/action flow for the new event.
Route tests must cover invalid IDs, event-filtered reads, event-scoped creates,
and rejection of an action for a request from another event.

Generated API reference material may describe handler signatures, but it must
defer to this page for route ownership, lifecycle behavior, isolation rules,
and rollout policy.
