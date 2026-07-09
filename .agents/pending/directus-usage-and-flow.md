# Task: Organize Directus Usage, Document the Real Auth Flow, and Evaluate Self-Hosted BaaS Alternatives

**Status:** 🕒 PENDING
**Priority:** 🟢 Low (not blocking; Directus is not load-bearing for any current user-facing flow)
**Created:** 2026-07-08

## Goal

Directus (`sso.hashpass.co` in production, `apps/directus` for local testing) is
kept for now rather than deleted, but its actual role in the codebase has
drifted from what the tenant config claims. This task is to:

1. Decide deliberately what Directus is *for* going forward (auth fallback? CMS? nothing — formally deprecate?) instead of leaving it in an ambiguous half-used state.
2. Document the **actual** current auth flow accurately (not the aspirational one implied by `sso-config.ts`).
3. Evaluate whether a single self-hosted, open-source backend could eventually replace both Supabase and Directus, since HASHPASS is already running three overlapping backends (Supabase, Better Auth, Directus) for what is functionally two jobs (auth+data, and CMS).

## Current State (as of 2026-07-08 — verified against actual call sites, not config)

| Concern | What actually handles it today | What the config *implies* handles it |
|---|---|---|
| Web email/OTP sign-in | Supabase directly (`supabase.auth.signInWithOtp`) + custom `/api/auth/otp` REST endpoints | — (bypasses `authService` entirely) |
| Web Google sign-in | **Better Auth first**, Supabase fallback only (see `apps/docs/docs/auth/AUTH_FLOW.md`) | `authProvider: 'directus'` for core tenant in `sso-config.ts` — stale |
| Native Android Google sign-in | Better Auth first (ID-token exchange), Supabase fallback | same stale mapping |
| Password-based sign-in | **Nothing calls it** — no UI screen uses `authService.signInWithEmailAndPassword` | Directus's password flow, unused |
| github/facebook/twitter sign-in | **No UI buttons exist for these** | Directus OAuth bridge, unreachable |
| Server-side token verification (`/api/qr/admin`, `/api/bslatam/meeting-slots/book`, `/api/auth/delete-account`) | **Unverified** — calls provider-agnostic `verifyUserToken`/`authenticateRequest`, which resolves `'directus'` for core hostname by default. Whether a Better-Auth-cookie-authenticated user's request to these routes actually verifies correctly has not been tested. | Directus bearer-token verification |
| CMS / structured content (events, speakers, marketing copy) | Nothing currently — no content is stored in Directus | `lib/backend/directus/*` implements a full `IBackendProvider` (database/storage/realtime) for this, but it's **not wired up as the active backend** (`lib/backend/index.ts` registers Supabase instead) |

**Root cause of the drift:** `packages/config/src/sso-config.ts` has a `MIGRATION_STATUS` block dated 2025-12-18 describing an in-progress "migrate everything to Directus" plan (`migration_phase: 'in_progress'`, todo list includes "Replace Supabase auth hooks with Directus auth hooks", "Remove Supabase dependencies") that was never completed and appears to have been reversed in practice — the codebase moved toward Supabase (OTP/email) + Better Auth (social/BSL) instead, without anyone updating `sso-config.ts`'s tenant mapping or removing the abandoned plan's traces.

## What Broke Because Of This (context, not to re-litigate)

On 2026-07-08, Google sign-in briefly routed through the stale `'directus'`
resolution for the OAuth *callback* handling step even after the *initiation*
step had been fixed to use Better Auth — surfacing as `"Google sign-in
completed, but Directus did not create a valid session"` even though Directus
was never actually involved. This class of bug (a stale/ambiguous provider
resolution silently misrouting one specific step of a multi-step flow) is
exactly the risk of leaving Directus in this half-configured state — it's not
hypothetical, it already caused a real incident the same day this task was written.

## Acceptance Criteria

- [ ] Verify whether Better-Auth-cookie-authenticated requests to `/api/qr/admin`, `/api/bslatam/meeting-slots/book`, and `/api/auth/delete-account` succeed for core hostname today (write a test or manually check) — this is the one place Directus's resolution could still be silently load-bearing in a way that matters
- [ ] Check for any existing user accounts whose *only* identity is Directus-issued (no matching Supabase `auth.users` or Better Auth `ba_users` row) — if any exist, they need a migration path before Directus can ever be removed
- [ ] Confirm whether anything outside this repo depends on `sso.hashpass.co` being reachable (other internal tools, admin scripts, etc.)
- [ ] Decide and record one of: (a) formally deprecate Directus for auth — update `sso-config.ts`'s `core` tenant to a provider that reflects reality, remove the OAuth bridge routes; (b) repurpose it as a CMS by actually wiring `lib/backend/directus/*` in for structured content; (c) leave as-is with the ambiguity documented and accepted
- [ ] Once decided, update `packages/config/src/sso-config.ts`'s stale `MIGRATION_STATUS` block to reflect the actual decision (delete it if the migration is formally abandoned, rewrite it if repurposing as CMS)
- [ ] Cross-link this task from `apps/docs/docs/auth/AUTH_FLOW.md`'s existing "Do we still need Directus?" section so future readers land here for the actionable follow-up

## Extra Section: Evaluate a Single Self-Hosted, Open-Source Backend

**Why this is worth exploring:** HASHPASS currently runs three backend
services doing overlapping jobs — Supabase (Postgres + auth + storage +
realtime, hosted), Better Auth (auth only, self-hosted on the app's own
Lambda), and Directus (Postgres CMS + auth, self-hostable, currently
under-used). If Supabase is ever a cost, vendor-lock-in, or data-residency
concern, a single self-hosted platform covering auth + database + storage +
realtime + admin UI could replace both Supabase *and* Directus's remaining
theoretical CMS role, cutting one whole service out of the stack instead of
maintaining three.

### Candidates

| Option | Storage engine | Auth (incl. OAuth) | Admin UI | Self-hosted | Fits HASHPASS's Postgres/RLS-heavy schema? |
|---|---|---|---|---|---|
| **PocketBase** (as you suggested) | SQLite (single file) | Yes, built-in, incl. Google OAuth | Yes, built-in | Yes — single Go binary | **No, not directly** — SQLite has no RLS, single-writer bottleneck at scale, and HASHPASS's existing schema (V001–V006 migrations, FK constraints, canonical `public.user` registry) is Postgres-native. Would mean a full data-layer rewrite, not a swap. |
| **Supabase self-hosted** | Postgres | Yes (GoTrue, same as today) | Yes (Studio) | Yes — official Docker Compose | **Best schema fit** — same Postgres, same GoTrue, same migrations; the only change is *where* it runs, not *how* it works. Trades cloud convenience for ops burden (you'd own uptime, backups, scaling). |
| **Appwrite** | MariaDB/MySQL (not Postgres) | Yes, incl. OAuth | Yes | Yes | Mature and full-featured, but not Postgres — same rewrite problem as PocketBase for the existing schema. |
| **Nhost** | Postgres (Hasura GraphQL layer) | Yes (Hasura Auth) | Yes | Yes | Postgres-native like Supabase, but adds a GraphQL layer (Hasura) the app doesn't currently use — bigger conceptual shift than self-hosting Supabase as-is. |
| **Directus itself** | Postgres (already the case here) | Basic, weaker OAuth ergonomics than Better Auth/Supabase | Yes, already deployed | Yes, already self-hosted at `sso.hashpass.co` | Already in the stack, already Postgres — the CMS half of "one self-hosted backend" is arguably already solved, just unused. The auth half is the weaker fit (see today's incident). |

### Recommendation for future exploration (not a decision — for the next person to pick up)

If the actual goal is "stop depending on Supabase Cloud specifically," **self-hosting Supabase itself** is the lowest-risk path — zero schema/migration rewrite, same GoTrue auth semantics, same client SDK calls already used everywhere in this codebase. It only trades a managed service for ops responsibility, not an architecture change.

If the actual goal is "consolidate three backends into one, ops burden included," PocketBase/Appwrite are worth a real spike, but budget for a genuine data-layer migration (schema, RLS-equivalent, all existing SQL migrations) — not a drop-in.

Either way, Directus's Postgres-native CMS capability is already sitting unused in this stack (`lib/backend/directus/*`) — worth using *that* for structured content before evaluating a fourth new platform.

## Files to Touch (when this task is picked up)

| File | Change |
|---|---|
| `packages/config/src/sso-config.ts` | Resolve the stale `MIGRATION_STATUS` block and `core` tenant `authProvider` mapping per the decision made |
| `apps/mobile-app/app/api/qr/admin+api.ts`, `app/api/bslatam/meeting-slots/book/+api.ts`, `app/api/auth/delete-account+api.ts` | Verify/fix Better-Auth-cookie handling if the acceptance-criteria check finds a gap |
| `apps/docs/docs/auth/AUTH_FLOW.md` | Update the "Do we still need Directus?" section with the final decision once made |
| `apps/directus/`, `lib/backend/directus/*`, `lib/directus-auth.ts`, `lib/auth/providers/directus*.ts`, `app/api/auth/oauth/{login,callback,google}+api.ts` | Removed or repurposed, depending on the decision |
