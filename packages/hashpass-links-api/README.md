# HashPass Links API

Backend service for **HashPass Auth**: passwordless, QR-code login. A browser
(currently `apps/web-app` / hashpass.club) starts a login challenge, the
HashPass mobile app scans and approves it under the user's own session, and
the browser exchanges the resulting one-time code for a real HashPass
session.

This package is intentionally its own service, separate from the main
`api.hashpass.tech` (Expo Router) API — see "Why a separate service?" below.

## Status: Phase 1 (auth-QR login only)

Everything in this package today is the auth-QR login flow, end to end, on
real infra (Lambda + API Gateway, real Supabase-backed sessions). The wider
"HashPass Links" product — arbitrary shortened/dynamic QR links, a
management dashboard, click analytics, the public `/q/:slug` redirect — is
**Phase 2** and deliberately not built yet. Its schema and validation logic
already exist (`@hashpass/backend`'s `qr-links` module,
`db/migrations/V079__hashpass_links_dynamic_qr.sql`) and this service's
router already has stub routes for it (see "Phase 2 stub routes" below), but
none of it is live. Building Phase 2 is future work, not started.

## Why a separate service?

`apps/web-app` (hashpass.club) is a **static export** — no server, deployed
as static files. Adding auth here the way `apps/mobile-app`'s API routes
work (Expo Router + Lambda) isn't an option without turning `apps/web-app`
into a standalone Next.js server, which would need entirely new
infrastructure this repo doesn't have. Instead, this service is its own
small Lambda + API Gateway pair, modeled on the existing
`packages/infra/terraform/modules/aws_expo_router_api` pattern (the same
module, actually — see the Terraform section below), and `apps/web-app`
calls it over plain HTTP via `@hashpass/sdk`'s `AuthQrClient`. `apps/web-app`
itself stays 100% static.

## Architecture

```
apps/web-app (hashpass.club, static)      apps/mobile-app
  SignInModal.tsx                            auth-qr-approve.tsx
  @hashpass/sdk AuthQrClient                  @hashpass/sdk AuthQrClient
        │  create / poll / exchange                 │  respond (approve/deny)
        ▼                                            ▼
  ┌─────────────────────────────────────────────────────────┐
  │  packages/hashpass-links-api  (this package)             │
  │  lambda/index.ts  -> src/router.ts -> src/routes/auth-qr │
  │  Supabase (challenges, sessions)                         │
  └─────────────────────────────────────────────────────────┘
```

Route handlers (`src/routes/auth-qr.ts`) and their crypto primitives
(`@hashpass/backend`'s `auth-qr/challenge.ts`, `auth-qr/session.ts`) are
Web-standard `Request`/`Response` based, framework-agnostic, and unit-tested
directly (`src/router.test.ts`) without needing a real Lambda or database —
see "Testing" below.

## Local dev

```bash
pnpm --filter @hashpass/hashpass-links-api run build   # typecheck (tsc --noEmit)
pnpm --filter @hashpass/hashpass-links-api run test     # tsx --test, no live DB needed
```

To exercise the service as a real HTTP server locally:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter @hashpass/hashpass-links-api run dev
# -> http://localhost:8788 (PORT env var to override)
```

`dev-server.ts` wraps `handleRequest` from `src/router.ts` in a plain Node
`http.createServer`, echoing CORS headers the same way `lambda/index.ts`
does in production. Point `apps/web-app`'s
`NEXT_PUBLIC_LINKS_API_BASE_URL` (and `apps/mobile-app`'s
`EXPO_PUBLIC_LINKS_API_BASE_URL`, for the approve side) at that URL for
local end-to-end testing. Requires the `V079__hashpass_links_dynamic_qr.sql`
migration to have been applied to whichever Supabase project you point it
at (`node packages/tools/scripts/migrate-tenant-db.mjs --profile=core-development --groups=hashpass-auth-qr`
for the shared dev database).

To build the actual Lambda deployment artifact:

```bash
./packages/tools/scripts/package-hashpass-links-lambda.sh
# -> hashpass-links-api-lambda.zip at the repo root
```

This runs `esbuild` (`build:lambda` in `package.json`) to bundle
`lambda/index.ts` into a single-file CJS `dist-lambda/index.js` that already
inlines its dependencies, then zips just that one file — no `node_modules`
install step, unlike the Expo Router API's packaging script.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | yes | Admin Supabase client (`src/server.ts`'s `adminDb()`) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Same — service-role key, never exposed to clients |
| `CORS_ALLOW_ORIGINS` | no | Comma-separated extra allowed origins, added to the built-in default list (`lambda/index.ts`'s `DEFAULT_CORS_ALLOWED_ORIGINS`: `hashpass.club`, `hashpass.link`, `localhost:3000`) |

The `qrUrl` returned by `POST /api/v1/auth/qr/challenges` is built from the
origin of the incoming request itself (`new URL(request.url).origin`), not
an env var — so it's always wherever this service is actually reachable
(the raw invoke URL pre-cutover, the real custom domain after), and can't
drift out of sync the way a separate `HASHPASS_LINK_ORIGIN` default could.

Consumers (`apps/web-app`, `apps/mobile-app`) point at this service via
their own `NEXT_PUBLIC_LINKS_API_BASE_URL` / `EXPO_PUBLIC_LINKS_API_BASE_URL`
— see each app's `.env.example`. Neither has a stable default yet (see
"hashpass.link cutover" below).

## Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | none | Liveness check |
| `POST` | `/api/v1/auth/qr/challenges` | none | Browser starts a login attempt (PKCE `codeChallenge` in, `qrUrl`/`state`/`binding` out) |
| `GET` | `/api/v1/auth/qr/challenges/:id` | `x-hashpass-binding` header + `state` | Browser polls for the mobile app's decision |
| `POST` | `/api/v1/auth/qr/challenges/:id/approve` | bearer token (app's own session) | Mobile app approves/denies, called under the user's own authenticated session |
| `POST` | `/api/v1/auth/qr/exchange` | `x-hashpass-binding` header | Browser trades the one-time authorization code + PKCE verifier for a real session |

Security properties, in one place since they're spread across a few files:
opaque/random/single-use/short-lived challenge IDs and codes
(`@hashpass/backend`'s `auth-qr/challenge.ts`, 180s TTL), browser-session
binding via an explicit opaque secret (see note below), explicit mobile-app
approval (never auto-approved), PKCE (`code_challenge`/`code_verifier`,
timing-safe comparison), and atomic single-use consumption at both the
approve and exchange steps (conditional `.eq('status', ...)` updates that
also check whether a row actually came back, not just the absence of an
error — see the comments on `approveChallenge`/`exchangeChallenge` in
`src/routes/auth-qr.ts` for the exact races these close, and
`src/router.test.ts`'s "concurrent exchange attempts" test for a real
demonstration that exactly one of two simultaneous exchanges wins).

**Why a header instead of a cookie:** the binding secret used to be an
`HttpOnly` cookie, but `hashpass.club` (browser) and `hashpass.link` (this
API) are different registrable domains, making it a *third-party* cookie —
and third-party cookie blocking (on by default in Safari, increasingly
elsewhere) operates independently of the `SameSite` attribute. A `SameSite`
fix alone does not make a blocked third-party cookie get sent; the browser
just never stores or attaches it, so the first poll would silently 401 for
a large and growing share of real users. Carrying the same opaque secret as
an explicit header instead sidesteps browser cookie policy entirely — the
SDK receives it directly in the create-challenge response body and sends it
back explicitly on every subsequent call (see `packages/sdk/src/auth-qr/client.ts`).

### Phase 2 stub routes

`GET /q/:slug`, and the `qr-links` CRUD/analytics routes, currently all
return `501` via `phase2NotReady()` in `src/router.ts`. Their schema
(`qr_links`, `qr_scan_events`, `qr_link_audit_events` tables) and validation
(`@hashpass/backend`'s `qr-links/validation.ts` — destination SSRF
allowlisting, QR visual-config contrast/quiet-zone checks) already exist and
are tested; only the live routes and any UI are what's missing.

## Testing

`src/router.test.ts` drives the full challenge → approve → exchange sequence
(including expiry, deny, sequential replay, and a genuine concurrent-race
case) against a fake in-memory Supabase client
(`src/test-utils/fake-supabase-client.ts`), injected via
`setAdminDbForTesting()` in `src/server.ts`. No real Supabase project or
network access is needed to run these tests. `@hashpass/backend`'s own
`tsx --test` suite separately covers the crypto primitives, destination
validation, and visitor-anonymization logic in isolation.

## Terraform

`packages/infra/terraform/stacks/hashpass-links-api` stands up dev + prod
Lambda + API Gateway pairs, reusing the existing generic
`packages/infra/terraform/modules/aws_expo_router_api` module (it's not
actually Expo-specific — just Lambda + HTTP API Gateway + an optional custom
domain — so this service reuses it directly rather than duplicating it).

```bash
cd packages/infra/terraform/stacks/hashpass-links-api
cp terraform.tfvars.example terraform.tfvars   # fill in real Supabase values
terraform init
terraform plan
```

### hashpass.link cutover

**`hashpass.link` is not yet confirmed as a registered/owned domain, and its
DNS/ACM must not be touched without an explicit go-ahead.** The stack
defaults to `enable_custom_domain = false`: applying it creates real Lambda
+ API Gateway resources reachable at their default
`*.execute-api.<region>.amazonaws.com` invoke URL — enough to validate the
whole flow end-to-end — without creating or modifying any DNS record. Point
`apps/web-app`/`apps/mobile-app`'s `*_LINKS_API_BASE_URL` env vars at that
invoke URL (see `links_api_base_urls` in the stack's outputs) for now. Only
flip `enable_custom_domain` to `true` once the domain is confirmed owned and
someone has explicitly signed off on the cutover.
