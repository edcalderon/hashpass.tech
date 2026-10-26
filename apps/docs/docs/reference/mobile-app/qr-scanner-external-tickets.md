# QR scanner: original tickets, ownership and misuse reports

The user and admin scanners accept any QR. A HashPass QR resolves through
`/api/qr/resolve`; anything else (a URL, JSON, or bare text, such as a Blockchain
Summit LATAM ticket) is parsed by `lib/external-ticket-qr.ts` and offered as an
**original ticket** the holder can exchange for an equivalent HashPass pass.

## Detection

`parseExternalTicketQr` returns `null` only for empty or oversized (>8192
characters) input. It extracts the ticket code from known query keys or the last
path segment, maps `blckchn.xyz` / `blockchainsummit` hosts to the issuer
`blockchain_summit_latam`, gives other hosts an `ext-<host>` issuer, and collects
holder and ticket-type metadata. When the QR carries no readable code, the
server derives a stable reference from the first 24 hex characters of the payload
digest, so claim and report derive the same code.

## One ticket, one owner

`external_ticket_claims` has partial unique indexes on issuer + event + ticket
code hash and on the QR digest, both `WHERE revoked_at IS NULL` (migration V152).
A second account submitting the same ticket gets `409` and the "Ticket already
claimed" state, from which it can report the ticket.

## Misuse reports

`POST /api/pass-ticket-reports` calls `report_external_ticket` (reasons:
`impersonation`, `stolen`, `duplicate`, `other`). You cannot report your own
claim, and one open report per reporter and ticket is kept. Admins list and
resolve reports at `/api/admin/pass-ticket-reports` (the **Ticket misuse reports**
section of the admin dashboard's claims tab). Confirming a report revokes the
claim, suspends the passes created from it and revokes their QR codes, which
frees the ticket for its rightful holder to claim. Dismissing leaves everything in
place.

## Holder identity at scan

`/api/qr/resolve` adds the holder's email and username only when the viewer is a
global admin or an admin/moderator of the pass's event
(`lib/server/qr-holder-contact.ts`). Regular scanners never receive the email.

## UI

`components/qr/ScanResultCard`, `ExternalTicketSheet` and `ExternalClaimReview`
are built only from the shared `Surface`, `Badge`, `ActionButton` and
`FilterChip` primitives and `uiPalette` tokens, so both scanners match the rest of
the app in light and dark mode.
