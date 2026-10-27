---
title: Meeting request rules
---

# Meeting request rules

Meetings are short by default, in the style of speed networking. A request is
one of two types, its length comes from the type and the boost, and a confirmed
meeting blocks the time for **both** people. Migrations `V155` and `V156` own
the rules; the app mirrors them only to preview what the server will do.

| Source | What it owns |
|--------|--------------|
| `db/migrations/V155__boosted_meeting_requests.sql` | Types, duration, priority, coffee gate |
| `db/migrations/V156__mutual_meeting_blocking.sql` | Mutual agenda blocking, interval overlap, slot grid |
| `db/tests/meeting_request_rules.sql` | Rollback-only SQL test of both migrations |
| `apps/mobile-app/lib/meeting-rules.ts` | TypeScript mirror used for UI previews |

## Meeting types

| Type (`meeting_type`) | Length | Who can book it |
|-----------------------|--------|-----------------|
| `speed` — **Quick stand-up** (default) | 5 minutes, extended by boost up to 30 | Every pass |
| `coffee` — **Coffee break** | 15, 30 or 45 minutes, chosen by the requester | `business` and `vip` passes only |

Older free-text types (`networking`, `business`, `partnership`, ...) are not
valid any more. The server normalises anything that is not `coffee` to
`speed`, and existing rows keep the value they were stored with.

## Duration and boost

`public.meeting_request_duration(type, boost_points, requested_minutes)` is the
single source of truth.

**Quick stand-up:** `5 + 5 per full 10 boost points`, capped at 30.

| Boost points | 0–9 | 10–19 | 20–29 | 30–39 | 40–49 | 50 |
|--------------|-----|-------|-------|-------|-------|----|
| Minutes | 5 | 10 | 15 | 20 | 25 | 30 |

**Coffee break:** the requested length snaps down to a 15-minute step and is
clamped to 15–45. Boost does **not** change a coffee break's length.

**Priority:** `priority_score = 50 + boost points` for both types. The
speaker's incoming list is ordered by `priority_score` (highest first), then
newest first. The points are charged to the pass (`used_boost_amount`) in the
same transaction that stores the request, and the request fails if the pass
does not have them. The drawer caps one request at 50 points, the amount that
already buys the 30-minute maximum. That cap is a UI limit: the server only
limits boost by the pass balance, so a modified client can spend more points
for a higher `priority_score` (the length stays capped at 30).

The client may send `durationMinutes`, but the server derives the length and
stores its own value, so a modified client cannot buy a longer meeting than its
boost pays for.

## Coffee breaks are gated on the server

The coffee gate does not trust the client. `insert_meeting_request` reads the
requester's active pass for the event from the database, and refuses a coffee
request unless it is `business` or `vip`. It raises SQLSTATE `HP403`, before
the request is stored and before any quota is consumed.

The API returns `403` with:

```json
{ "error": "Coffee meetings require a business or VIP pass", "code": "coffee_requires_business_pass" }
```

The app also hides the option for general passes and re-checks the pass tier
before sending, but those are conveniences, not the rule.

## Confirmed meetings block both people

When a speaker accepts a request (`accept_meeting_request`), the whole
interval `[start, start + duration)` is blocked for the speaker **and** for the
requester:

- each person gets a `booked` row in `meeting_slots` and a row in `meetings`;
- nobody else can book either person for any overlapping time, whether the
  other person is the host or the requester of a meeting;
- every conflict check compares intervals, not exact start times, so a 10-minute
  stand-up at 10:03 is refused if 10:00–10:05 is taken;
- cancelling a request, or resolving a conflict by dropping a meeting, frees
  both sides. The host's slot returns to the open pool and the requester's
  blocking row is removed.

Outcomes of an accept:

| Situation | Result |
|-----------|--------|
| Speaker is free, requester is free | `confirmed`, both blocked |
| Speaker already has an overlapping meeting | Refused with `speaker_slot_conflict` |
| Speaker has an overlapping agenda session of their own (anything beyond "interested") | Refused with `agenda_slot_conflict` |
| Requester already has an overlapping meeting | Accepted as `tentative`; the requester is notified and must resolve the conflict (`requires_resolution: true`) |

Blocking uses `block_meeting_interval` and `release_meeting_interval`. Both are
internal helpers with `EXECUTE` revoked from `PUBLIC`, `anon` and
`authenticated`; only the functions above call them.

## Slot grid

`get_speaker_available_slots` offers start times on a grid that follows the
meeting length, so short meetings are not forced onto quarter-hours:

| Meeting length | Grid |
|----------------|------|
| 5 minutes | every 5 minutes |
| 10 minutes | every 10 minutes |
| 15 minutes and longer | every 15 minutes |

A slot is hidden when the speaker, or the requesting user, is busy at any point
in the meeting. `GET /meetings/requests/slots` defaults `durationMinutes` to 5.

## API contract

`POST /api/events/:eventId/meetings/requests`

| Field | Rule |
|-------|------|
| `meetingType` | `speed` (default) or `coffee`; anything else is treated as `speed` |
| `durationMinutes` | Whole number from 5 to 45. Default 5 (`speed`) or 15 (`coffee`). Re-derived by the server |
| `boostAmount` | Whole, non-negative; limited by the pass's remaining boost points (the drawer caps one request at 50) |

The response reports the length the server stored in `durationMinutes`.
Errors: `400` for a duration outside 5–45, `403` for the coffee gate above.

## In the app

The request drawer ([`MeetingRequestSheet`](https://github.com/hashpass-tech/hashpass.tech/blob/develop/apps/mobile-app/components/MeetingRequestSheet.tsx))
starts with the meeting type. Coffee shows 15/30/45 length chips and is locked
with a hint for general passes. The boost bar shows `5 min → N min` for a
stand-up, or the chosen length for coffee, together with the queue-priority
tier. Strings live in `networking.meetingRequestModal` (English, Spanish and
Korean; other languages fall back to English).

## Testing

```bash
pnpm --filter hashpass-mobile-app exec jest tests/lib/meeting-rules.test.ts \
  tests/components/MeetingRequestSheet.test.tsx tests/api/meeting-requests.test.ts \
  tests/api/meeting-request-slots.test.ts tests/api/admin-matchmaking.test.ts
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/meeting_request_rules.sql
```

The SQL test creates its own event, users, speakers and passes and rolls
everything back. Run it on a database with the production-shaped core schema.

:::caution Shared dev project drift
The shared development Supabase project lags the migrations: its
`meeting_requests` table is missing the `V038` columns (`speaker_name`,
`requester_name`, `priority_score`, `meeting_id`, ...) and its
`meeting_request_status` enum has no `requested` value. `V155`/`V156` were
verified on a production-shaped copy only, so repair that drift before
applying them to the dev project, and expect `meeting_request_rules.sql` to
fail there until then.
:::

## Related

- [Event API architecture](./event-api-architecture.md)
- [Speaker statuses](./speaker-statuses.md)
- [Database schema](../../infra/DATABASE_SCHEMA.md)
