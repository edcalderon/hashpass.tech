---
title: Contacts rollout checklist
---

# Contacts network rollout

Status: implementation complete; draft promotion PR [#418](https://github.com/hashpass-tech/hashpass.tech/pull/418) is open; hosted validation and release review pending.

Scope: the primary Expo/PWA app's `/dashboard/contacts` and `/contacts` experiences, interest profiles, mutual connection requests, QR cards, Network XP and an opt-in leaderboard. Network XP does not change wallet HashPoints.

Implementation and verification details: `apps/docs/docs/guides/contacts.md`.

## Review and integration

- [x] Adapt the supplied network graph design to production tokens/primitives and both themes.
- [x] Implement the global authenticated API and service-role-only storage/RPC.
- [x] Add EN/ES/KO messages and regression tests for consent, progression, validation, account isolation and UI interactions.
- [x] Validate the SQL migration locally, Storybook build, and desktop/mobile web interactions.
- [x] Register V127 under `contacts-network` in the standard migration runner.
- [x] Open the protected `develop -> main` promotion PR through the repository release script: [#418, v1.9.135](https://github.com/hashpass-tech/hashpass.tech/pull/418).
- [ ] Review CI, security checks and at least 69% patch coverage; obtain the required approval before merge.

## Hosted development validation

- [ ] Supply the existing development database/public Supabase/server authentication bindings securely in the environment; do not put their values in this task or PR.
- [ ] Preview `pnpm db:migrate -- --profile core-development --groups contacts-network --dry-run`, then apply with the configured development profile.
- [ ] With two real test accounts, verify card creation and interest persistence across reload and dashboard/standalone routes.
- [ ] Scan/open a shared card, send a request and verify the recipient can accept/decline while another account cannot.
- [ ] Confirm pending/declined/duplicate requests do not add XP; one accepted pair adds exactly 100 XP to each account.
- [ ] Verify leaderboard/discovery opt-outs, search, grouping, QR/copy, sign-out/account switching and failure recovery.
- [ ] Repeat on `bsl-development` if included in rollout; verify native devices before claiming device readiness.

## Production handoff

- [ ] Have the authorized operator verify a restorable pre-migration backup and apply `contacts-network` to `core-production` using the standard runner; never use `--skip-backup` by default.
- [ ] Verify production API credentials point to core, the Contacts RPC is service-role-only, and responses remain private/no-store.
- [ ] Merge only after review and rollout prerequisites; follow automatic tagging/deployment/OTA checks from `CLAUDE.md`, without manually triggering duplicate release workflows.
- [ ] Run the authenticated smoke flow against the deployed API and both URLs, record actual results, and move this task to done.

Hosted migrations, authenticated end-to-end testing and production deployment have not been performed in this cloud instance. GitHub API access is verified and the PR is open. The development/production database URL and Supabase runtime bindings remain absent locally; enter required values through secure environment configuration rather than this task, source files or PR comments. Keep the PR in draft until its hosted validation and required checks/review are complete.
