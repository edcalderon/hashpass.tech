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

To exercise the service as a real HTTP server locally, write a tiny wrapper
around `handleRequest` from `src/router.ts` (e.g. Node's `http.createServer`
or `Bun.serve`) with `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` pointed at a
real (dev) Supabase project — there's no dedicated local-server script yet.

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
| `HASHPASS_LINK_ORIGIN` | no (defaults to `https://hashpass.link`) | Origin used to build the `qrUrl` returned by `POST /api/v1/auth/qr/challenges` |
| `CORS_ALLOW_ORIGINS` | no | Comma-separated extra allowed origins, added to the built-in default list (`lambda/index.ts`'s `DEFAULT_CORS_ALLOWED_ORIGINS`: `hashpass.club`, `hashpass.link`, `localhost:3000`) |

Consumers (`apps/web-app`, `apps/mobile-app`) point at this service via
their own `NEXT_PUBLIC_LINKS_API_BASE_URL` / `EXPO_PUBLIC_LINKS_API_BASE_URL`
— see each app's `.env.example`. Neither has a stable default yet (see
"hashpass.link cutover" below).

## Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | none | Liveness check |
| `POST` | `/api/v1/auth/qr/challenges` | none | Browser starts a login attempt (PKCE `codeChallenge` in, `qrUrl`/`state` + `HttpOnly` binding cookie out) |
| `GET` | `/api/v1/auth/qr/challenges/:id` | browser-binding cookie + `state` | Browser polls for the mobile app's decision |
| `POST` | `/api/v1/auth/qr/challenges/:id/approve` | bearer token (app's own session) | Mobile app approves/denies, called under the user's own authenticated session |
| `POST` | `/api/v1/auth/qr/exchange` | browser-binding cookie | Browser trades the one-time authorization code + PKCE verifier for a real session |

Security properties, in one place since they're spread across a few files:
opaque/random/single-use/short-lived challenge IDs and codes
(`@hashpass/backend`'s `auth-qr/challenge.ts`, 180s TTL), browser-session
binding via an `HttpOnly`/`Secure` cookie, explicit mobile-app approval
(never auto-approved), PKCE (`code_challenge`/`code_verifier`, timing-safe
comparison), and atomic single-use consumption at exchange time (a
conditional `.eq('status', 'approved')` update — see the comment above
`exchangeChallenge` in `src/routes/auth-qr.ts` for the exact race it closes,
and `src/router.test.ts`'s "concurrent exchange attempts" test for a real
demonstration that exactly one of two simultaneous exchanges wins).

**Cross-origin cookie note:** the binding cookie is `SameSite=None` (not
`Strict`), because `hashpass.club` (browser) and `hashpass.link` (this API)
are different registrable domains — every poll/exchange call is a
cross-site request by definition, and a `Strict`/`Lax` cookie would never be
attached to those at all. This is safe because the cookie is `HttpOnly`
(unreadable by any page's JS) and the response is only exposed cross-origin
to the small CORS allow-list above (which also sets
`Access-Control-Allow-Credentials` for exactly those origins). See the
comment on `bindingCookie()` in `src/routes/auth-qr.ts`.

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
