# [P0 · milestone 2.0] HASHPASS Passport: Universal Event Inbox MVP

Status: in progress. Tracking issue: [#425](https://github.com/hashpass-tech/hashpass.tech/issues/425).

Source: user-supplied Markdown export of [HASHPASS Passport — Universal Event Inbox & IRL Graph](https://app.notion.com/p/HASHPASS-Passport-Universal-Event-Inbox-IRL-Graph-3e30738d2ce6810a8566ecfe785813f2).

## Problem and outcome

Professional event-goers receive tickets and invitations across unrelated platforms. They should be able to forward a confirmation or share a public event URL and receive a useful, private Event Capsule without an organizer integration or a manual event form.

The MVP proves capture → immediate utility → a second voluntary import. It does not require a broad application rebuild. Treat “2.0” as a product milestone pending release-scope clarification; do not manually bump versions or invoke release/push tooling as part of this initial implementation.

## MVP acceptance criteria and delivery slices

### 1. Extraction contract and normalization foundation

- [x] Provider-neutral extraction contract, with confidence per field.
- [x] Separate shared Event draft from owner-scoped private UserEvent source data.
- [x] Preserve source provenance privately; never infer attendance, issuer verification, or registration from an import.
- [x] Require correction of missing, invalid, or low-confidence title, time, timezone, and venue.
- [x] Normalize explicitly offset timestamps; reject impossible or offset-free dates.
- [x] Supply a conservative candidate match fingerprint that distinguishes event editions and locations. A fingerprint alone must not authorize a merge.
- [x] Regression tests for privacy separation, confidence, timestamps, and duplicate candidates.
- [ ] Review the initial configurable 0.9 confidence threshold using real cohort accuracy. It is an engineering default, not a product decision or measured guarantee.

Implementation: `packages/backend/src/passport/{types,normalize,normalize.test}.ts`, exported by `@hashpass/backend`.

### 2. Private capture and persistence — next vertical slice

- [ ] Authenticated account can provision/rotate/revoke a cryptographically random private `save+<token>@in.hashpass.tech` address. Store token digests, enforce ownership, and avoid logging full addresses or message contents.
- [ ] Receive authenticated provider webhooks; validate signatures, enforce size/type limits, rate-limit, and make provider message IDs idempotent.
- [ ] Extract event metadata and supported attachments via replaceable adapters; attach field confidence and original provenance.
- [ ] Paste/share a URL through an authenticated endpoint; restrict fetching against SSRF, redirects, resource limits, and private ticket URLs.
- [ ] Save canonical Event candidates and owner-private UserEvents transactionally; resolve conflicts and duplicates conservatively. Different users importing the same public event must retain separate private data.
- [ ] Store TicketArtifacts privately with authorized short-lived access and explicit retention. No raw email, ticket token, QR, or private source URL enters shared event records, public profiles, logs, or analytics.
- [ ] Test account isolation, forged/replayed webhooks, expired/revoked tokens, malicious URLs, duplicate delivery, conflicting dates, and cross-user imports against the real persistence layer.

### 3. Event Capsule and correction

- [ ] User receives “Saved — open your Event Capsule” only after durable persistence; uncertain extraction opens a minimal correction flow.
- [ ] Capsule shows date, timezone, venue/map, private source and ticket/QR, and calendar export/action.
- [ ] Confirm only ambiguous fields; never present extracted tickets as HASHPASS-issued or as attendance proof.
- [ ] Upcoming list and an owner-configurable reminder handle timezone and corrected/rescheduled event data.
- [ ] Use existing shared UI, localization, accessible controls, reduced motion, and honest empty/loading/error states.

### 4. After-event utility and control

- [ ] Private notes, consent-aware contacts and follow-up action/reminder.
- [ ] Explicit privacy controls; sharing is opt-in and excludes ticket/QR data.
- [ ] Export and delete private records/artifacts, including a documented raw-email retention policy and deletion behavior for backups/provider copies.
- [ ] Verify delete/export authorization and propagation; deleting one user's import must not delete another user's private records.

### 5. Pilot evidence

- [ ] Median forward-to-Capsule <60 seconds.
- [ ] ≥85% correct event, date, timezone and venue without manual repair.
- [ ] ≥70% report meaningful effort saved or better preparation.
- [ ] ≥40% of qualified users import a second event within 30–45 days or explicitly enable another capture channel.
- [ ] <20% need more than one correction.
- [ ] No public ticket/QR exposure; explicit, controllable raw-email retention.
- [ ] ≥50% use a utility beyond storage (calendar, reminder, briefing, follow-up or sharing).
- [ ] Measure aggregate outcomes without storing private inbox or ticket contents in analytics.

The source's September–October 13, 2026 sprint dates are historical. Rebaseline the four phases (12–15 interviews, concierge prototype, 20–30-user real-use pilot, repeat-behavior decision) before scheduling a new cohort. Do not report these targets as observed results.

## Out of scope

Organizer ticket validation/dashboard, payments/custody/tokens, full Gmail/Outlook mailbox OAuth, many deep platform integrations, public attendee directories by default, universal travel/concert/expense management. ICS and image/PDF adapters are secondary capture priorities; the P0 wedge remains email and URL. Connections and Credentials are later domain expansions; importing a ticket never grants issuer-confirmed or attendance-verified trust.

## Open decisions and external dependencies

- Inbound provider, DNS/domain ownership and authenticated webhook delivery for `in.hashpass.tech`.
- Raw-email retention default and exact confidence/correction policy, based on cohort evidence.
- First UI surface and strongest immediate utility; default initial target is the existing mobile/PWA app, subject to validation.
- Database/storage schema, migrations, RLS, encryption and deletion/export behavior before accepting real private imports.
- Reminder/reply delivery and job runtime; reuse existing providers where appropriate.
- Whether “2.0” means a feature milestone or a v2.0.0 major release; use existing release automation once scope is settled and work is ready.
- Inbound-email provider and production database/storage credentials must be checked through the existing environment before requesting new bindings. The normalization foundation needs no credentials.

## Current implementation boundary

The first slice is a tested in-process normalization foundation. It does **not** receive emails, fetch URLs, persist data, enforce database authorization, expose an API/UI, send reminders, or implement deletion/export. `ready` means the extracted draft meets field checks, not that it has been saved or verified. Authenticated callers must supply the owner from their session. Adapters must explicitly classify public event URLs; URL syntax cannot determine whether a path contains a private ticket token.

## Validation

- `pnpm --filter @hashpass/backend test` (includes Passport regression cases).
- `pnpm --filter @hashpass/backend build` (TypeScript, no emit).
- Baseline environment: club web typecheck/build, local home/events HTTP checks, and 19 existing mobile pass-wallet tests passed before feature implementation.

## Delivery issues

Sub-issues of #425, all in HASHPASS project #4: #474 persistence and schema, #475 private inbox, #476 secondary adapters, #477 Capsule UI and export/delete, #478 pilot evidence and decision gate. #425 is itself a sub-issue of the hackathon epic #455.

## Publication

Published as [#425](https://github.com/hashpass-tech/hashpass.tech/issues/425). Keep this plan and the issue synchronized as delivery slices land. The initial implementation remains local on `develop`; no commit, push, version bump, or release was performed.
