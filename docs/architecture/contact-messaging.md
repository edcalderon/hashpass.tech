# Contact messaging

Tracked in GitHub #620, under epic #455.

The root `ContactMessagingProvider` polls the authenticated inbox every 15 seconds
while the application is active, and refreshes on app resume and successful
mutations. Changing accounts clears private state and invalidates pending requests.
The floating Messages action shows up to three actual contact avatars, initials
when an image is missing or fails, and an overflow count. It only appears when a
conversation needs a reply and opens Wallet → Contacts → Messages. Contacts
remains available from navigation when no replies are pending.

A conversation needs a reply when its latest message came from the other person.
Opening or reading it never clears that state. A successfully persisted reply does.
Message IDs are generated on the client and reused on retry to prevent duplicates.
Conversation history loads in pages of 50; old history remains available during
polling. Sending is limited to 4,000 characters and 30 new messages per minute.

## Connections and handles

An accepted meeting request creates one accepted mutual contact edge, resolving
Supabase identities to canonical registry IDs. Both current speaker auth IDs and
legacy speaker record IDs are supported. Existing contact profiles are preserved;
new speaker profiles use their speaker identity and avatar. Existing accepted
requests are backfilled by the migration. An unclaimed/unlinked speaker cannot be
connected until both registry identities exist.

Contact handles use 3–30 lowercase ASCII letters, numbers or underscores. The UI
normalizes a leading `@` and letter case; the API accepts only the normalized
exact value. There is no prefix lookup or user-search endpoint. Handles are unique
and cannot be reassigned. Unambiguous valid canonical usernames are seeded;
other users claim a handle after creating their contact card. A request by handle
uses the existing mutual-consent incoming/accept/decline flow.

## Storage and rollout

Apply `db/migrations/V180__contact_messaging.sql` before deploying the application
changes. It adds handles, direct contact messages, server-only RPCs and the meeting
acceptance trigger. It retains the existing contact network RPC behind a wrapper.
No migration or application deployment is performed by this implementation task.

The new direct-contact messages are stored on the server and are separate from
the existing encrypted meeting-chat feature. Tables have RLS enabled and no direct
anonymous/authenticated privileges. Only the service-role API may execute the
RPCs, with the actor supplied by `resolveNotificationIdentity`. Thread reads and
sends require an accepted connection; bodies cannot choose the authenticated actor.
Thread reads and sends also require the existing wallet PIN and authenticator proofs. Without these proofs, the global notification endpoint returns only names, avatars and pending state, with message previews and contact details removed. Responses use private, no-store cache headers. Per-sender and per-connection locks
serialize rate checks and message ordering.

## Verification

Run the app's Jest tests for `contact-messages`, `contact-messaging`, and the Contacts
regression suites, the changed-file typecheck, `pnpm check:design-system`, and the
Storybook build. Production stories cover the floating pill, hidden state, profile
limits, long labels, and the Contacts Messages inbox in light/dark/mobile layouts.
Browser checks do not substitute for native device verification.

A disposable PostgreSQL test runs the actual migration chain and checks connection
creation, avatars, actor isolation, request acceptance, exact handles, duplicate
sends, reply state, pagination and rate/length limits. PGlite is an optional isolated
test tool and does not become an application dependency:

```sh
npm install --prefix work/db-tests --no-save --ignore-scripts @electric-sql/pglite@0.3.14
node db/tests/contact-messaging.mjs ./work/db-tests/node_modules/@electric-sql/pglite/dist/index.js
```
