---
title: DoorReady evidence and capsule foundation
---

# DoorReady evidence and capsule foundation

**Status: experimental engineering foundation; not available in the HASHPASS app.** There is no deployed DoorReady endpoint, upload flow, storage bucket, or Meta inference service yet. Do not send real ticket, attendee, or personal data through development fixtures.

This reference describes the domain contract being developed for [DoorReady MVP issue #455](https://github.com/hashpass-tech/hashpass.tech/issues/455). It is not an API integration guide and documents no live endpoint.

## Records

- A `SourceDocument` is immutable after upload and scoped to one authenticated `userId`. It records a SHA256 digest, private storage reference, MIME type, size, and receive time.
- A `FactEvidence` identifies one proposed field value, its source document, a citation or page/region, and a review state (`supported`, `ambiguous`, `conflicting`, or `unknown`). Model confidence is not treated as a calibrated probability.
- An `EventCapsule` is versioned and user-scoped. Its trust state may not silently advance to issuer confirmation or verified attendance.

The shared types live in `@hashpass/types`; server-side validation and reconciliation live in `@hashpass/backend/src/doorready`.

## Safety rules

- The server supplies the authenticated owner and source document ID. Provider output cannot select another user's owner or source.
- Dates require an explicit offset and time zones must be valid IANA identifiers. Missing or invalid values stay unresolved; the server's local time zone is never inferred.
- A new document is reconciled only after an explicit capsule selection. Same-name events are not auto-merged.
- When a later source disagrees about the venue or time, the existing value and original evidence remain in place and the changed field requires review.
- The original issuer artifact is referenced by its source document ID. No QR, barcode, ticket bytes, issuer verification, or attendance proof is generated.
- The generated brief includes only source-backed facts and always labels the issuer unverified.

The current implementation is a pure in-process domain layer. Authentication, uploads, private object storage, migrations, the Meta API, the user interface, and offline Door Mode remain planned work tracked in issue #455.
