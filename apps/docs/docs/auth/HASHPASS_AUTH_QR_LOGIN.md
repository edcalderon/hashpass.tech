# HashPass Auth (QR Login)

Passwordless login for `hashpass.club`: a browser shows a QR code, the
HashPass mobile app scans and approves it under the user's own session, and
the browser ends up with a real HashPass session — no password, no email
round trip.

Implementation detail (routes, env vars, local dev, Terraform, Phase 2
scope) lives in
[`packages/hashpass-links-api/README.md`](../../../../packages/hashpass-links-api/README.md).
This page covers the flow and where each piece lives, for orientation.

## Why a separate service

`apps/web-app` (hashpass.club) is a static export with no server of its
own — unlike `apps/mobile-app`, which has API routes backed by
`hashpass-{dev,prod}-expo-router-api` on `api.hashpass.tech`. Rather than
turning `apps/web-app` into a standalone server, HashPass Auth is its own
small Lambda + API Gateway service, `packages/hashpass-links-api`, modeled
on the same `aws_expo_router_api` Terraform module the main API already
uses. `apps/web-app` stays 100% static and just calls this service over
HTTP.

## Flow

1. **Browser starts a challenge.** `apps/web-app`'s `SignInModal` calls
   `@hashpass/sdk`'s `AuthQrClient.beginLogin()`, which generates a PKCE
   pair and `POST`s `codeChallenge` to `/api/v1/auth/qr/challenges`. The API
   returns an opaque challenge id, a `qrUrl`, a `state` value, and a
   `binding` secret — derived from wherever the request actually reached
   the service, so it works whether that's the raw Lambda invoke URL
   (pre-`hashpass.link`-cutover) or the eventual custom domain.
2. **Browser renders the QR and polls.** The QR encodes `qrUrl`. The browser
   polls `GET /api/v1/auth/qr/challenges/:id` (sending `binding` back as an
   `x-hashpass-binding` header, plus `state`) until the status changes from
   `pending`.
3. **Mobile app scans and approves.** `apps/mobile-app`'s existing
   `QRScanner` component recognizes the `/auth/:id` URL shape
   (`lib/auth-qr.ts`'s `parseAuthQrScan`) before falling through to its
   normal pass-token scanning pipeline, and routes to a dedicated
   `auth-qr-approve` screen. Under the user's own authenticated session,
   approving or denying calls `AuthQrClient.respondToLogin(challengeId,
   decision)`.
4. **Browser exchanges the code.** Once approved, the poll response
   includes a one-time authorization code. The browser calls
   `AuthQrClient.exchangeLogin()` (or the higher-level `waitForLogin()`,
   which drives steps 2–4 in one call), which atomically consumes the
   challenge and returns a real Supabase session
   (`{accessToken, refreshToken}`). `apps/web-app` hands that straight to
   `supabase.auth.setSession()`.

## Security properties

- Opaque, random, single-use, short-lived (180s) challenges and codes.
- Browser-session binding via an explicit `x-hashpass-binding` header, not a
  cookie. `hashpass.club` and `hashpass.link` are different registrable
  domains, which makes a binding cookie a *third-party* cookie — and
  browsers that block third-party cookies (Safari by default, increasingly
  others) do so independently of the `SameSite` attribute, so a cookie-based
  design would silently fail for a large share of real users. An explicit
  header sidesteps that entirely.
- Explicit mobile-app approval — never auto-approved.
- PKCE (`code_challenge`/`code_verifier`), timing-safe comparison.
- Atomic single-use consumption at both the approve and exchange steps, so
  two racing requests can't both succeed (see
  `packages/hashpass-links-api/src/router.test.ts`'s concurrent-exchange
  test).

## Status

Phase 1 only — the login flow above, on real infra behind its default API
Gateway invoke URL. `hashpass.link` DNS/ACM has not been cut over yet. The
broader "HashPass Links" product (arbitrary dynamic QR links, management
dashboard, click analytics, public `/q/:slug` redirects) is Phase 2 and not
built — see the package README's "Phase 2 stub routes" section.
