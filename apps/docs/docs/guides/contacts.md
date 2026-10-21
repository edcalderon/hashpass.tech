---
title: Contacts network
---

Contacts is a global, account-scoped experience in the mobile/PWA app:

- `/dashboard/contacts` lives inside the existing authenticated dashboard drawer.
- `/contacts` renders the same experience independently, with a public introduction for guests.
- `/contacts?card=<share-id>` preserves a shared card through sign-in and contact-card creation.

The network graph, searchable directory, incoming requests and leaderboard use the existing HASHPASS primitives and theme tokens. Cards contain a display name, role, company and up to five interests. Email and phone numbers are never returned by the Contacts API. Graphs show up to 80 contacts; the directory remains available for the full network. Topic groups use each contact's first selected interest; company grouping is also available. Animations are intentionally static, including under reduced motion.

## Persistence and consent

`GET /api/contacts` and `POST /api/contacts` use the existing authenticated API client and canonical registry identity resolver. They never accept the actor identity from the request body. The server-only `contact_network` RPC uses `public.user.id`, supporting provider-linked accounts rather than assuming a Supabase auth UUID.

Apply `db/migrations/V127__contacts_network.sql` with the repository's normal migration process **before deploying the API**. It creates contact profiles, unique unordered contact pairs, the private read model and a service-role-only RPC. No migration was applied to a hosted database during implementation. The API needs the existing profile's server-side Supabase configuration and service-role access; the frontend needs the existing public Supabase/auth configuration. API calls are global (`skipEventSegment: true`), never event/tenant-prefixed.

The migration is registered as `contacts-network` and included in the app profiles' default migration groups. To review only this migration without touching a database:

```sh
pnpm db:migrate -- --profile core-development --groups contacts-network --dry-run
```

Once the development database binding is configured, apply the same command without `--dry-run`, then verify with two authenticated test accounts: save both cards, share a link, send/accept a request and confirm one connection and 100 additional XP for each account. Check discovery and leaderboard opt-outs, repeated accepts, sign-out/account switching, and the dashboard/standalone routes. Test the `bsl-development` profile separately if releasing that tenant.

Before production promotion, use the migration runner's required pre-migration dump and the `core-production` profile. Do not bypass backup checks or copy the development schema into production. Keep the promotion PR unmerged until the authorized production operator has verified migration readiness, the required CI/security/patch-coverage checks pass, and the required review is recorded. Merging the normal promotion PR triggers the repository's release automation.

Sharing a card lets another authenticated person request a connection. It does not automatically add a contact. Only the recipient can accept or decline; only the sender can cancel. Closed requests cannot be resent automatically. At most 50 outgoing requests may remain pending. Discovery and leaderboard visibility are separate, explicit opt-ins, both disabled initially. People with the card link can view the shared card after sign-in even when discovery is disabled; do not include private information in the display fields.

Network XP is **not wallet HashPoints**, currency or a redeemable balance. It is computed by the server: 100 XP per unique accepted connection, plus 20 XP per selected interest (maximum five). Every 500 XP advances a level. Removing an interest recalculates XP; repeated saves, scans and accepts cannot award duplicate points. The leaderboard displays the top 20 opted-in profiles with positive XP, ordered by XP and then account ID for ties. No sample contacts or rankings are seeded in production.

## Validation

From the repository root, activate its pinned Node/pnpm tools and run:

```sh
pnpm --dir apps/mobile-app exec jest --runInBand --watchAll=false tests/lib/contacts.test.ts tests/api/contacts.test.ts tests/hooks/useContacts.test.tsx tests/app/contacts-screen.test.tsx tests/app/contacts-graph.test.tsx tests/app/contacts-routing.test.tsx
pnpm check:design-system
pnpm check:type-placement
node packages/tools/scripts/typecheck-changed.mjs
pnpm build:storybook
```

`Product/Contacts` in Storybook renders the production experience with clearly fictional catalog-only fixtures: light, dark, mobile, empty, guest and unavailable states. UI checks cover search, sibling tabs, profile editing and QR sharing on desktop/mobile in both themes. Live authenticated end-to-end testing requires the migration and configured backend. Native devices have not been verified.
