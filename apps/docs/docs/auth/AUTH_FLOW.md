# Authentication Flow

> **Passes / admin roles missing for a Better Auth user?** See
> [USER_REGISTRY.md § Path 4 — Better Auth → Supabase bridge](USER_REGISTRY.md#path-4--better-auth--supabase-bridge-v18273)
> (v1.8.273). Every Better Auth sign-in now also bridges to a real Supabase
> `auth.users` account, which is what BSL pass provisioning and admin-role
> FKs actually key off of — this flow doc covers how the user *signs in*, not
> how their identity gets bridged afterward.

> **Dashboard stability:** the Better Auth bootstrap and `useAuth()` update
> contract is a critical runtime boundary. See
> [AUTH_BOOTSTRAP_STABILITY.md](AUTH_BOOTSTRAP_STABILITY.md) before changing
> provider resolution, auth subscribers, or auth-consuming dashboard UI.

## Current Main Auth Flow (as of 2026-10-17)

**Apple status (verified 2026-10-17): enabled for web/PWA and iOS.** Better Auth
uses the protected Apple provider configuration for browser OAuth and the
native iOS identity-token exchange. Android intentionally keeps the Apple
button hidden. See [SIGN_IN_WITH_APPLE.md](SIGN_IN_WITH_APPLE.md) for the
tested runtime flow and [APPLE_SIGN_IN.md](APPLE_SIGN_IN.md) for credential
operations. Do not infer production readiness from the App Store Connect app
record alone.

**Better Auth is now the only web Google sign-in path for every tenant** — both
`hashpass.tech` (core) and the BSL event tenants. The browser never starts
Supabase Google OAuth directly, and the Directus OAuth bridge is effectively
unused for Google (see
["Do we still need Directus?"](#do-we-still-need-directus) below). This
replaces the short-lived "Supabase-first" design from earlier the same day —
that design made Google's account picker show the raw Supabase project URL
(`fxgftanraszjjyeidvia.supabase.co`) instead of `hashpass.tech`, and created
two divergent Google identities for the same user (`ba_users` vs
`auth.users`), depending on which host happened to resolve.

### Web: Better Auth only

1. `useAuth.signInWithOAuth('google')` on web always constructs/reuses a
   `BetterAuthProvider` (from `@hashpass/auth`) and calls
   `signInWithOAuth('google')` on it first. `authService` now resolves to
   Better Auth for core and BSL tenants, so the same instance is reused where
   available instead of constructing a second one.
2. Better Auth's client calls `POST {apiBase}/api/auth/sign-in/social`, which
   returns a Google authorize URL with `redirect_uri=<apiBase>/api/auth/callback/google`.
   The browser is redirected there.
3. Google completes the handshake and redirects back to Better Auth's own
   callback (`/api/auth/callback/google`), which exchanges the code, sets a
   secure session cookie, and redirects to the app's `callbackURL`
   (`/auth/callback?returnTo=...`) — no code/token appears in that URL, since
   Better Auth already consumed it server-side.
4. `app/(shared)/auth/callback.tsx` calls `handleOAuthCallback()`. Because the
   sign-in button set `auth_signin_method=google_oauth` in `localStorage`,
   `useAuth.ts`'s callback handler checks for a live Better Auth session
   (`getSession({ force: true })`) **before** falling through to
   `authService.handleOAuthCallback` — otherwise it would call Directus's
   callback handler (since that's still core's resolved provider) against an
   empty params object and fail with a misleading "Directus did not create a
   valid session" error.
5. If Better Auth cannot start or complete the flow, the app reports the
   Better Auth error and returns to the login screen. The error callback must
   not pre-fill a generic `error` or `message`: Better Auth appends the actual
   provider `error` and `error_description` to that URL, and the login screen
   displays that description so a local configuration or consent failure can
   be diagnosed. It does not redirect to Supabase's `/auth/v1/authorize`
   endpoint.

### Local Expo web development

When the Expo web app runs at `http://localhost:8081` while the client points
at `https://api-dev.hashpass.tech/api/auth`, the Better Auth client must send
credentialed cross-origin requests. The OAuth-start response sets the state
cookie on the API origin, and the session probe after the Google callback reads
that same origin's session cookie. The shared `BetterAuthProvider` configures
`credentials: 'include'` for these requests; changing it back to the browser's
same-origin default causes the flow to finish at `/auth/callback` with
“Authentication completed but no Better Auth session was found.”

The browser callback remains `http://localhost:8081/auth/callback`; Google
still returns to the Better Auth API callback first. If this error reappears,
confirm that the dev API allows the localhost origin with credentials and that
the browser has not blocked the API's secure session cookie. A local API
serving Better Auth directly needs its own localhost Google redirect URI and
does not use the shared dev API cookie.

### Native: Better Auth first, Supabase ID-token fallback

Native (Android) still starts with the Google Sign-In SDK account picker, then
exchanges the returned ID token with Better Auth first. Supabase
`signInWithIdToken()` remains a native-only compatibility fallback, described
below in [Native Google Sign-In SDK Flow](#native-google-sign-in-sdk-flow-android).

<a id="do-we-still-need-directus"></a>

## Do We Still Need Directus?

**Decision: keep it for now, but it's not being used as auth or CMS today.**
Tracked as a pending follow-up in `.agents/pending/directus-usage-and-flow.md`
— that task covers verifying the one place it could still be silently
load-bearing (server-side token verification on a few API routes), checking
for Directus-only user accounts, and evaluating whether to formally
deprecate it, repurpose it as a CMS, or leave it as-is. It also has a section
evaluating self-hosted alternatives (PocketBase, self-hosted Supabase, etc.)
in case Supabase itself is ever reconsidered.

As of this writing, nothing in the running app actually reaches Directus for
a real sign-in:

- Email/OTP sign-in on web talks to Supabase directly
  (`supabase.auth.signInWithOtp`) or the custom `/api/auth/otp` +
  `/api/auth/otp/verify` REST endpoints — neither goes through `authService`.
- Web Google sign-in now goes through Better Auth only (see above) — Directus
  is never attempted for `provider === 'google'` on web.
- No UI screen calls `authService.signInWithEmailAndPassword` (Directus's
  password flow) or offers github/facebook/twitter buttons.
- The only remaining code path that branches on `providerName === 'directus'`
  is in `useAuth.ts`'s native OAuth-URL-callback parsing
  (`app/(shared)/auth.tsx` → `signInWithOAuth`, around the
  `WebBrowser.openAuthSessionAsync` branch) — reachable only if a non-Google
  provider were ever wired up, or as a deep fallback if both native Google SDK
  and Supabase are unavailable.
- `apps/directus/README.md` describes it as "Directus for local auth/SSO
  **testing**... does not contain application code" — it was never meant to be
  the production auth backend long-term.
- `SSO_CONFIG.tenants.core.authProvider` now selects Better Auth. This removes
  the abandoned Supabase→Directus migration setting from core provider
  resolution, so magic-link callbacks no longer attempt to use the retired
  Directus SSO host.

**Before fully removing it**, check whether any _existing_ users still carry
Directus-issued sessions/tokens that would need a migration path, and whether
`sso.hashpass.co` is relied on by anything outside this app (e.g. an admin
tool). Those are the only reasons this doc doesn't say "delete it now."

## Production Requirements

For the Better Auth Google flow (now the default for every tenant on web):

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL=https://api.hashpass.tech/api/auth` (server) /
  `EXPO_PUBLIC_BETTER_AUTH_URL=https://api.hashpass.tech/api/auth` (client)
- `BETTER_AUTH_DATABASE_URL` (falls back to `DATABASE_URL`/`DATABASE_URL_PROD`
  if unset) — must point at a database that already has Better Auth's core
  tables (`ba_users`, `session`, `account`, `verification`); see
  ["Schema migration"](#schema-migration) below
- `BETTER_AUTH_GOOGLE_CLIENT_ID` / `BETTER_AUTH_GOOGLE_CLIENT_SECRET` (or the
  existing `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`)
- The OAuth Client in Google Cloud Console must have
  `<apiBase>/api/auth/callback/google` registered as an authorized redirect
  URI for **every** environment that uses it — e.g.
  `https://api.hashpass.tech/api/auth/callback/google` for production and
  `https://api-dev.hashpass.tech/api/auth/callback/google` for Expo web local
  development when `EXPO_PUBLIC_API_BASE_URL` targets the shared dev API. The
  local browser callback remains `http://localhost:8081/auth/callback`, but
  Google always returns to the Better Auth API callback first. Register
  `http://localhost:8081/api/auth/callback/google` only when a local API is
  actually serving Better Auth. This is separate from any legacy Supabase
  redirect URI; the web Google flow no longer depends on Supabase's Google
  provider being enabled.
- `packages/config/src/sso-config.ts`'s `SSO_CONFIG.cors.origins` (Better
  Auth's `trustedOrigins`) must include the actual frontend origin(s) —
  `https://hashpass.tech`, `https://www.hashpass.tech`, `https://dev.hashpass.tech`
  were missing until 2026-07-08 and would have made Better Auth reject
  requests from the production core domain.
- API Gateway and the Lambda adapter CORS allowlists must include the same
  credentialed frontend origins. In particular, `https://dev.hashpass.tech`
  must be allowed by `hashpass-dev-http-api`; otherwise the browser blocks
  `https://api-dev.hashpass.tech/api/auth/sign-in/social` during Google
  sign-in before Better Auth can start the redirect.
- The API Lambda adapter must forward API Gateway v2 `event.cookies` into the
  Fetch `Cookie` header before handing the request to Expo Router / Better
  Auth. Better Auth stores the OAuth state in a secure cookie on
  `api.hashpass.tech`; if the callback reaches `/api/auth/callback/google`
  without that cookie, the server rejects the Google return as
  `state_mismatch` and the app falls back to `/auth`.

For the Better Auth X (Twitter) flow (web only — see above):

- `BETTER_AUTH_TWITTER_CLIENT_ID` / `BETTER_AUTH_TWITTER_CLIENT_SECRET` (or
  the bare `TWITTER_CLIENT_ID` / `TWITTER_CLIENT_SECRET`)
- The X Developer Portal app must have
  `<apiBase>/api/auth/callback/twitter` registered as a Callback URI for
  every environment, same pattern as Google's redirect URI above:
  `https://api.hashpass.tech/api/auth/callback/twitter` (production) and
  `https://api-dev.hashpass.tech/api/auth/callback/twitter` (dev / shared
  dev API). Same `trustedOrigins`/CORS/cookie-forwarding requirements as
  Google apply, since it's the same Better Auth instance and route.

Supabase compatibility paths (email/OTP and native fallback only):

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (or the active
  profile-specific equivalents)
- Supabase redirect allow-list entries for passwordless callbacks

The Directus bridge (`/api/auth/oauth/login` → Directus → `/api/auth/oauth/callback`)
still exists in the tree for compatibility but is not reachable from the
Google sign-in button anymore — see ["Do we still need Directus?"](#do-we-still-need-directus).

## Sign in with Apple (web and iOS)

The current Apple flow, safe secret setup, and release checklist are documented
in [Sign in with Apple](SIGN_IN_WITH_APPLE.md). In summary, web/PWA—including
iOS Safari—uses Better Auth OAuth with Apple's `response_mode=form_post`, the
API boundary preserves the state cookie and normalizes the allow-listed form
fields, iOS native exchanges the Apple identity token with Better Auth, and
Android intentionally does not render an Apple button. The production
configuration and verified iOS Safari smoke test are recorded in that page.

## Sign in with X (Twitter)

X/Twitter uses Better Auth's browser-based OAuth flow, not the legacy Directus
bridge. On the web/PWA it follows the same redirect pattern as Google and
Apple. On the native iOS and Android apps, it uses the platform authentication
session and returns to `hashpass://` with the Better Auth session cookie.

X does not provide a current native sign-in SDK or an app-switch OAuth 2.0
contract that HASHPASS can safely use. Do not probe for or force-open the X app
as an authentication path: it cannot return the PKCE/state-bound response that
the server needs to validate the sign-in. The secure, supported fallback is the
system auth session (ASWebAuthenticationSession on iOS and a Custom Tab on
Android), which shares the user's browser X session when available. A native
app must use this browser handoff even when the X app is installed.

1. **X Developer Portal → App → User authentication settings**, for the
   `hashpass.tech` app:
   - **App permissions:** `Read` (profile info only — this integration never
     posts or DMs on a user's behalf).
   - **Request email from users:** on — Better Auth keys account
     linking/dedup off the user's registry by email the same way Google and
     Apple do.
   - **Type of App:** `Web App, Automated App or Bot` (confidential client —
     this issues a Client ID **and** Client Secret, matching how
     `socialProviders.google`/`.apple` already hold both server-side; a
     `Native App` client is public/PKCE-only and does not fit this flow).
   - **Callback URI / Redirect URL**, register one per environment, exactly
     matching the Google pattern:
     - `https://api.hashpass.tech/api/auth/callback/twitter` (production)
     - `https://api-dev.hashpass.tech/api/auth/callback/twitter` (dev / local
       Expo web pointed at the shared dev API)
     - `http://localhost:8081/api/auth/callback/twitter` — only needed when
       `BETTER_AUTH_URL` is unset locally, so Better Auth resolves its own
       host dynamically and treats the local Expo dev server itself as the
       API (confirmed: this is the redirect_uri a real local
       `signIn.social({ provider: 'twitter' })` call produced on
       2026-10-06). Same local-direct-API case already documented for
       Google above. X permits plain `http://localhost` callback URIs for
       development, unlike most providers that require HTTPS everywhere.
   - **Website URL:** `https://hashpass.tech`
2. Set `BETTER_AUTH_TWITTER_CLIENT_ID` / `BETTER_AUTH_TWITTER_CLIENT_SECRET`
   (or the bare `TWITTER_CLIENT_ID` / `TWITTER_CLIENT_SECRET` fallback,
   mirroring the Google env var pair) in each environment's secrets. Until
   both are set, `socialProviders.twitter` is omitted entirely and the
   `/auth` screen's X button fails with Better Auth's normal "provider not
   configured" error rather than crashing the route.
3. `account.accountLinking.trustedProviders` includes `'twitter'`, so a user
   who already has a Google/email/Apple account can link an X account on the
   same email even though X's OAuth 2.0 user-lookup response does not
   reliably report the email as verified.
4. The sign-in button lives in `apps/mobile-app/app/(shared)/auth.tsx`
   (`handleXSignIn`). On web it starts the Better Auth redirect; on native it
   starts the system auth-session handoff. Icon is `components/icons/XIcon.tsx`,
   an inline `react-native-svg` path of the real X brand mark — **not**
   Ionicons' `logo-twitter`, which Ionicons dropped after the rebrand without
   adding a replacement, so that name renders a missing-glyph fallback (a
   question mark) instead of a logo; see that file's header comment and
   `components/icons/SettingsIcons.tsx` for the same pattern used elsewhere.
   The visible label is `t('signInWithX', 'Continue with X')`.
5. Successful Google, Apple, and X web callbacks all return through the same
   Better Auth cookie-session handler. The app records the initiating provider
   (`google_oauth`, `apple_oauth`, or `twitter_oauth`) before it redirects, so
   a completed X callback cannot be misrouted to the legacy provider handler.

## Relevant Routes

- `apps/mobile-app/hooks/useAuth.ts` — `signInWithOAuth` and `handleOAuthCallback` (Better-Auth-first social routing, including X on native)
- `packages/auth/src/providers/better-auth.ts` — `BetterAuthProvider.signInWithOAuth` / `.handleOAuthCallback`
- `apps/mobile-app/lib/server/better-auth.ts` — server-side Better Auth config (`socialProviders.google`/`.twitter`, `allowedHosts`, `trustedOrigins`)
- `apps/mobile-app/lib/server/better-auth-route.ts` — wraps Better Auth's route handler so auth errors never strand users on the API host
- `apps/mobile-app/lib/server/better-auth-error-redirect.ts` — converts Better Auth `/api/auth/error?...` and bad redirect targets into frontend `/auth?...` redirects
- `packages/infra/lambda/index.js` — converts API Gateway v2 events into Fetch requests; must preserve the OAuth state cookie from `event.cookies`
- `apps/mobile-app/lib/supabase.ts` — fallback path only
- `apps/mobile-app/app/(shared)/auth/callback.tsx`
- `apps/mobile-app/app/api/auth/[...auth]+api.ts` — Better Auth's catch-all handler, exported through the wrapper above
- `apps/mobile-app/app/api/auth/oauth/login+api.ts` / `callback+api.ts` — Directus bridge (rarely reached now)

<a id="schema-migration"></a>

## Schema Migration

Better Auth's core tables (`ba_users`, `session`, `account`, `verification`)
are **not** created by any file under `db/migrations/` — that folder only
covers the canonical `public.user` registry. Each Supabase project/profile
has its own Postgres, so a fresh environment (e.g. a new dev project) needs
this run once:

```bash
# From apps/mobile-app — @better-auth/cli needs a plain `auth` export, but
# lib/server/better-auth.ts exports a lazy getAuth() getter (so bundling
# doesn't connect to the DB at import time). Bridge it with a throwaway file:
cat > better-auth.cli-config.ts <<'EOF'
import { loadServerEnvFiles } from './lib/server/load-server-env';
import { getAuth } from './lib/server/better-auth';
loadServerEnvFiles();
const instance = getAuth();
if (!instance) throw new Error('getAuth() returned null — set DATABASE_URL first.');
export const auth = instance;
EOF

npx @better-auth/cli generate --config ./better-auth.cli-config.ts --output ./schema.sql -y
# review schema.sql — should be additive CREATE TABLE/INDEX only — then apply
# it against the target database (e.g. via psql or a small pg script), and
# delete better-auth.cli-config.ts afterward.
```

Confirmed present in both the local `core-development` and production
`core-production` databases as of 2026-07-08 (BSL had already migrated
theirs); this only needs re-running for a genuinely new database.

## OTP and SMS Authentication

The native client presents a six-digit code flow. The “Magic Link” label is a
compatibility label in the UI; the server does not put a login credential in a
mobile deep link. Every challenge has a purpose, a ten-minute expiry, a
single-use state, and a five-attempt maximum.

### Email login (`POST /api/auth/otp`)

1. Normalize the email and ask `supabase.auth.admin.generateLink({
   type: "magiclink", email })` for a single-use GoTrue token.
2. Keep the token material server-side in `otp_codes.token_hash`; it is never
   returned to the client. Generate the six-digit delivery code with Node's
   CSPRNG and store only `code_hmac`, keyed by the Supabase service secret and
   bound to the normalized email and `purpose = "email-login"`.
3. Mark any previous active email challenge for that account as used, then send
   the new code through the configured SMTP provider. A request that also
   enrolls a phone creates an independent SMS challenge as well.
4. The database is restricted to `service_role`; anonymous and authenticated
   PostgREST roles cannot read the challenge rows.

### Email login verification (`POST /api/auth/otp/verify`)

1. Recompute the keyed HMAC from `{ email, code, purpose }`.
2. Call `consume_email_otp`, which locks the newest active row, increments
   failed attempts, returns `locked` after five failures, and marks a valid
   row `used = true` in the same transaction. This prevents concurrent replay.
3. Parse the server-only GoTrue token material and call
   `/<supabase-project>/auth/v1/verify` directly with that project's anon key.
   The route tries `{ token_hash, type }` first and the `{ email, token, type }`
   fallback for GoTrue versions that require the raw email OTP token.
4. Return the GoTrue session to the client, which calls
   `supabase.auth.setSession()`.

`supabase.auth.verifyOtp()` is intentionally not used: the JS client adds PKCE
fields that older GoTrue versions reject with “Only the token_hash and type
should be provided.”

### SMS registration and trusted-phone enrollment

SMS is an authenticator, not proof of an email identity by itself.

- The request must contain an E.164 phone number. A new account can start with
  SMS, but it cannot receive a session or bind the phone until the email OTP is
  also verified.
- An existing account may propose a first or second phone from the sign-in
  screen. The phone is not trusted until both the email and SMS challenges pass.
- `public.sms_auth_challenges` stores only the challenge UUID, keyed email and
  phone lookups, the phone's last four digits, a keyed code verifier, purpose,
  expiry, and locked attempt/delivery counters.
- `POST /api/auth/phone` consumes registration or enrollment challenges through
  `consume_sms_auth_challenge`. Successful registration is finalized by
  `consume_sms_registration`, which locks the account capacity check and allows
  at most two active rows in `public.user_phone_authenticators`.
- `claim_sms_delivery_slot` allows at most three deliveries per phone in each
  ten-minute bucket. Brevo receives the code; neither the code nor the full
  phone number is stored in Postgres.

### Account-deletion OTP

`/api/auth/delete-account-otp` uses the same `public.otp_codes` table with
`purpose = "account-delete"`. It invalidates older deletion challenges and
calls `consume_email_otp` with that purpose, so an email-login code cannot
authorize account deletion.

### Canonical database objects and cleanup

| Object | Role | Sensitive values stored? |
| --- | --- | --- |
| `public.otp_codes` | Email login and account-deletion challenges | HMAC verifier and server-only GoTrue token material; never the six-digit code |
| `public.sms_auth_challenges` | Registration and trusted-phone challenges | HMAC lookups/verifier and phone last four digits only |
| `public.user_phone_authenticators` | Verified phone bindings | Phone lookup HMAC and last four digits only |
| `public.sms_delivery_rate_limits` | Atomic SMS delivery buckets | Phone lookup HMAC only |

There are no separate `email_otp`, `sms_otp`, or legacy OTP-code tables. The
old plaintext `otp_codes.code` column and its code/token indexes were removed
by `V131__retire_legacy_plaintext_otp_storage.sql`; that migration also deletes
expired, used, and legacy rows before dropping the column. `qr_auth_challenges`
is a separate QR-login protocol and must not be removed; Better Auth's
`verification` table is also unrelated.

### Migration order and operations

The auth migration group is deliberately ordered:

1. `db/migrations-mobile-bootstrap/V005__otp_codes.sql` — baseline table and
   cleanup function.
2. `db/migrations/V128__user_setup_and_pin.sql` — server-only setup state,
   peppered PIN verifiers, and atomic PIN lockout RPCs.
3. `db/migrations/V129__secure_sms_authenticators.sql` — HMAC-backed SMS
   challenges, trusted phones, rate limiting, and the `code_hmac` column.
4. `db/migrations/V130__atomic_otp_consumption.sql` — OTP purposes, attempt
   limits, and the locked `consume_email_otp` function.
5. `db/migrations/V131__retire_legacy_plaintext_otp_storage.sql` — purge of
   legacy rows and removal of plaintext storage/indexes.

Apply and verify a profile through the migration runner; do not run ad-hoc DDL:

```bash
pnpm run db:migrate -- --profile core-development --groups auth
pnpm run db:migrate -- --profile core-production --groups auth
```

The production runner creates its pre-migration dump automatically. A safe
read-only inventory should show only the four canonical objects above (plus
the unrelated QR and Better Auth tables). Never print database URLs, service
keys, OTP values, or full phone numbers in logs or documentation.

### Relevant files

- `apps/mobile-app/app/api/auth/otp+api.ts` — email/SMS send endpoint
- `apps/mobile-app/app/api/auth/otp/verify+api.ts` — email OTP verification
- `apps/mobile-app/app/api/auth/phone+api.ts` — SMS enrollment/registration
- `apps/mobile-app/app/api/auth/delete-account-otp+api.ts` — deletion code send
- `apps/mobile-app/app/api/auth/delete-account-otp/verify+api.ts` — deletion verification
- `apps/mobile-app/lib/server/sms-auth.ts` — CSPRNG/HMAC/SMS delivery helpers
- `db/migrations/V129__secure_sms_authenticators.sql` — SMS schema and RPCs
- `db/migrations/V130__atomic_otp_consumption.sql` — email OTP RPC
- `db/migrations/V131__retire_legacy_plaintext_otp_storage.sql` — legacy cleanup

## Native Google Sign-In SDK Flow (Android)

Android builds use the [`@react-native-google-signin/google-signin`](https://github.com/react-native-google-signin/google-signin) SDK (v16) instead of a browser popup when public Supabase config exists and `EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN=true` is baked into the bundle at build time.

### How it works (updated 2026-07-08: Better Auth first, same as web)

```
Android native app
  └─ signInWithOAuth('google') called
        │  (nativeGoogleEnabled=true and Supabase public config is present)
        ▼
  GoogleSignin.hasPlayServices()
        ▼
  GoogleSignin.configure({ webClientId: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID })
        ▼
  GoogleSignin.signIn()   ← system account picker (no browser popup)
        │
        ▼
  response.data.idToken   ← ID token from Google's servers
        │
        ▼
  BetterAuthProvider.signInWithIdToken('google', idToken)
        │  POST {apiBase}/api/auth/sign-in/social  { provider: 'google', idToken: { token } }
        │  (no browser redirect — Better Auth verifies the ID token's signature/audience
        │   directly against its configured Google client ID, same credential pair as web)
        ▼
  success? ──yes──▶ Better Auth session established → user logged in
        │
        no (error/throw)
        ▼
  supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })  ← fallback only
        ▼
  Supabase session established → user logged in
```

Mirrors the web precedence (see [Current Main Auth Flow](#current-main-auth-flow-as-of-2026-10-17)) so native and web users end up under the same Better Auth identity rather than diverging depending on platform. `BetterAuthProvider.signInWithIdToken` is implemented in `packages/auth/src/providers/better-auth.ts` using Better Auth's documented ["Sign in with ID Token"](https://www.better-auth.com/docs/concepts/oauth#sign-in-with-id-token) support — no new native SDK code, no extra user interaction, same `GoogleSignin` call as before.

### Required configuration

| Setting                            | Value                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN` | `true` (baked into bundle at CI build time)                                           |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | OAuth 2.0 Web client ID from GCP (type: Web application)                              |
| GCP Android OAuth client SHA-1     | **App signing key certificate** SHA-1 from Play Console → App integrity → App signing |

**Critical:** Google Play re-signs the AAB with its own App Signing Key. The SHA-1 registered in GCP must be the **App signing key** from Play Console, NOT the upload key from your local keystore. Using the upload key SHA-1 causes `DEVELOPER_ERROR` at runtime.

| Key                                                       | SHA-1                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------- |
| App signing key (Play, register this in GCP)              | `38:54:0E:C7:01:A7:11:AF:EE:D0:80:B1:EC:D0:E1:09:09:B0:68:79` |
| Upload key (local Fastlane build, do NOT register in GCP) | `C1:B7:B9:E6:7F:D1:99:06:16:07:6E:D0:0E:D3:BA:20:12:24:8C:B1` |

### Sign-out behavior

`GoogleSignin.signOut()` is called at the start of every app sign-out (in `useAuth.signOut()`) so the system account picker always appears on the next login attempt instead of silently reusing the cached account. It is also called when the user clears cache in Settings.

A **Reset Google Account** button in Settings → Security lets users manually revoke the cached account selection without signing out of the app.

### Relevant files

- `apps/mobile-app/app/_layout.tsx` — `GoogleSignin.configure()` called once on app boot
- `apps/mobile-app/hooks/useAuth.ts` — `signInWithOAuth('google')` native SDK path and `signOut()` cache clearing
- `apps/mobile-app/app/(shared)/dashboard/settings.tsx` — Reset Google Account button

### Fallback

If Play Services are unavailable or the user cancels, the flow falls through to the `WebBrowser.openAuthSessionAsync` browser OAuth path (unchanged from web).

## Troubleshooting

### Web Google sign-in returns a Better Auth error before Google opens

This means Better Auth's own attempt failed before it could return Google's
authorize URL. Diagnose in this order — each was an actual bug found and fixed
on 2026-07-08, and any one of them alone can stop the flow:

1. **`curl <apiBase>/api/auth/get-session`** — if it 500s with
   `z.coerce.boolean(...).meta is not a function` (or a minified variant like
   `n.coerce.boolean(...)`), Metro's `blockList` in
   `apps/mobile-app/metro.config.js` is blocking `better-auth`'s own bundled
   `zod@4` and falling back to the repo root's mismatched `zod@3`. The
   blockList must exempt `better-auth/`, `better-call/`, and `@better-auth/`
   nested `node_modules`. This bug affects the **built Lambda bundle** too
   (`expo export` uses the same Metro config), not just local dev.
2. **If it 500s with `Host "..." is not in the allowed hosts list`** — the
   requesting host+port isn't in `DEFAULT_ALLOWED_HOSTS` in
   `apps/mobile-app/lib/server/better-auth.ts`. Better Auth matches the raw
   `Host` header including the port (`localhost:8081`, not just `localhost`).
3. **If it 500s with `relation "verification" does not exist`** (or `session`/`account`/`ba_users`)
   — Better Auth's schema was never migrated on that database. See
   ["Schema migration"](#schema-migration) above. Each Supabase
   project/profile has its own Postgres, so this can pass on one environment
   and fail on another.
4. **If `get-session` returns `200`/`null` cleanly but `sign-in/social` returns
   `redirect_uri_mismatch` from Google** — the OAuth Client in Google Cloud
   Console doesn't have `<apiBase>/api/auth/callback/google` registered as an
   authorized redirect URI for that host. This is a per-environment,
   per-domain manual step in Google Cloud Console — nothing in the repo can
   fix it. Both the local dev port and the production `api.hashpass.tech`
   callback need to be registered on the same OAuth Client.

### "Directus did not create a valid session" after a successful Google consent screen

This means the callback landed correctly but `useAuth.ts`'s callback handler
called `authService.handleOAuthCallback` (which resolves to Directus for core
on web) instead of checking Better Auth's session first. Confirm
`app/(shared)/auth.tsx`'s `handleGoogleSignIn` still sets
`localStorage.setItem('auth_signin_method', 'google_oauth')` before calling
`signInWithOAuth`, and that `useAuth.ts`'s `handleOAuthCallback` still checks
for that marker on web before falling through to `authService`. This isn't a
Directus problem despite the message text — Directus was never actually
involved.

### Browser lands on `https://api.hashpass.tech/?error=state_mismatch` or `/api/auth/error?...`

This is a Better Auth failure path, not a successful login. It means Better
Auth rejected the callback before app code could restore a session, usually
because the OAuth `state` cookie was missing, stale, or no longer matched the
callback request.

The production fix shipped on 2026-07-08 is server-side:

1. `apps/mobile-app/lib/server/better-auth-route.ts` intercepts requests to
   Better Auth's catch-all route before and after the framework handler runs.
2. If the request itself is `/api/auth/error?...`, or if Better Auth tries to
   redirect the browser from `/api/auth/*` to `/` with auth error params,
   `apps/mobile-app/lib/server/better-auth-error-redirect.ts` rewrites the
   response to the frontend auth screen instead.
3. The final browser destination becomes
   `/auth?error=state_mismatch&message=...&returnTo=...` on the frontend
   origin, not the API host. Local requests stay on `http://localhost:8081`,
   `api-dev.hashpass.tech` maps to `https://dev.hashpass.tech`, and production
   maps to `https://hashpass.tech`.

If this page ever reappears on the API host in production, the wrapper route
has regressed or the deployed API bundle is older than the frontend bundle.

### Other

- If the browser lands on a Supabase `/auth/v1/authorize?provider=google` URL, web Google has regressed into the removed fallback path. The correct web path starts at `/api/auth/sign-in/social` and returns through `/api/auth/callback/google`.
- If the browser lands on `/dashboard/explore?error=oauth_failed...`, check the API Lambda logs for the callback request ID.
- For `DEVELOPER_ERROR` on Android Google Sign-In: verify the SHA-1 in the GCP Android OAuth client is the **App signing key** SHA-1 from Play Console (not the upload key).
- If the system account picker is skipped and the previous account is reused: the user should tap **Reset Google Account** in Settings → Security, or sign out and back in.
- If login ever reaches the Directus bridge (`/api/auth/oauth/login`) unexpectedly for `provider=google` on web, that's itself a bug now — see ["Do we still need Directus?"](#do-we-still-need-directus).

## Logged-out visitors must never render the dashboard (fixed 2026-08-17)

`app/events/[eventSlug]/home.tsx` — the redirect target for every "open this
event" tap on the public landing page (including the landing hero carousel)
— unconditionally sent **every** visitor, logged in or not, into
`/(shared)/dashboard/explore`, a protected route. This wasn't just a
redirect-to-the-wrong-place bug: the dashboard layout's own guard
(`app/(shared)/dashboard/_layout.tsx`) only ejects an unauthenticated visitor
after a multi-second grace period *by design* (see
[AUTH_BOOTSTRAP_STABILITY.md](AUTH_BOOTSTRAP_STABILITY.md) and the comment
above that effect) — that delay exists to avoid force-unmounting mid-render
during a real transient auth-provider flap, which was crashing natively on
Android. So a genuinely logged-out visitor would see real dashboard content
render for real, for real seconds, before the eventual bounce to `/auth`.

A second, independent leak had the same effect: `components/EventBanner.tsx`'s
"explore more events" button (shown on a finished/archived event's banner —
reachable from the landing carousel and from
`/events/{id}/event-info`) pushed straight to
`/(shared)/dashboard/explore` with no auth check of its own.

Both are fixed the same way — check `isLoggedIn` from `useAuth()` before
ever navigating toward the dashboard, and send a logged-out visitor to the
event's own public info page (`/events/{id}/event-info`, no auth required)
instead:

- `events/[eventSlug]/home.tsx`: authenticated → `/(shared)/dashboard/explore?eventId=...` (unchanged); logged out → `/events/{id}/event-info`.
- `EventBanner.tsx`'s "explore more events" button: same branch, using its own `eventId` prop.

`app/index.tsx` (the app root) was already correctly gated on
`isLoggedIn && user` and was not affected.

**Defense in depth added to `dashboard/_layout.tsx` itself:** the redirect
timer's timing is unchanged (still delayed, still only for the real
transient-flap case the crash fix needs) — but the component now also
refuses to *render* dashboard content at all when auth has finished loading,
`isLoggedIn` is false, and there's no recent-auth grace window
(`hasRecentAuthSuccess()`) that could mean this is just that transient flap
on a real session. In that unambiguous case it renders a plain
`LoadingScreen` while the existing redirect timer runs its course, instead
of the real dashboard UI. This means any *future* path that mistakenly
routes a logged-out visitor into `/dashboard/*` no longer results in visible
protected content, even temporarily — the specific two leaks above are still
the real fix; this is the safety net for the next one.

**Local testing note:** `EXPO_PUBLIC_DEV_AUTH_BYPASS` (see
`lib/auth/dev-bypass.ts`) intentionally overrides all of the above for local
dev convenience — both the entry-point redirects and the dashboard's guard
treat it the same as `isLoggedIn`. Set it to `false` in your local
`.env`/`.env.local` before testing logged-out behavior, or you'll reproduce
exactly this bug by design and think the fix didn't work.
