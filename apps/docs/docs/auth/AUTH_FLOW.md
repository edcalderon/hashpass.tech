# Authentication Flow

## Current Main Google Flow (as of 2026-07-08)

**Better Auth is now the default web Google sign-in path for every tenant** — both
`hashpass.tech` (core) and the BSL event tenants. Supabase is only used as a
last-resort fallback if Better Auth's own request fails outright, and the
Directus OAuth bridge is effectively unused for Google (see
["Do we still need Directus?"](#do-we-still-need-directus) below). This
replaces the short-lived "Supabase-first" design from earlier the same day —
that design made Google's account picker show the raw Supabase project URL
(`fxgftanraszjjyeidvia.supabase.co`) instead of `hashpass.tech`, and created
two divergent Google identities for the same user (`ba_users` vs
`auth.users`), depending on which host happened to resolve.

### Web: Better Auth first, Supabase as fallback

1. `useAuth.signInWithOAuth('google')` on web always constructs/reuses a
   `BetterAuthProvider` (from `@hashpass/auth`) and calls
   `signInWithOAuth('google')` on it first — regardless of what
   `authService.getProviderName()` resolves to for the tenant (which for core
   is still the stale `'directus'` value; see below). If `authService` is
   already Better Auth (BSL tenants), that same instance is reused instead of
   constructing a second one.
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
5. Only if step 1/2 itself throws or returns an error does the code fall back
   to the old direct `supabase.auth.signInWithOAuth({ provider: 'google' })`
   call, which still works if Supabase's Google provider is enabled for the
   resolved project.

### Native: unchanged

Native (Android) still uses the Google Sign-In SDK + `supabase.auth.signInWithIdToken()`
path described below in [Native Google Sign-In SDK Flow](#native-google-sign-in-sdk-flow-android) —
that flow was not touched by the Better Auth change.

## Do we still need Directus? {#do-we-still-need-directus}

**Decision: keep it for now, but it's not being used as auth or CMS today.**
Tracked as a pending follow-up in [`.agents/pending/directus-usage-and-flow.md`](../../../../.agents/pending/directus-usage-and-flow.md)
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
- Web Google sign-in now goes through Better Auth first, Supabase second (see
  above) — Directus is never attempted for `provider === 'google'` on web.
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
- `SSO_CONFIG.tenants.core.authProvider: 'directus'` in
  `packages/config/src/sso-config.ts` is a holdover from an abandoned
  Supabase→Directus migration plan (see that file's own `MIGRATION_STATUS`
  block, dated 2025-12-18, `migration_phase: 'in_progress'`, never completed).
  It still affects `authService.getProviderName()` and a couple of debug/UI
  branches, but no longer determines which backend actually handles a sign-in
  for Google or OTP.

**Before fully removing it**, check whether any *existing* users still carry
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
  `http://localhost:8081/api/auth/callback/google` for local web dev. This is
  separate from, and in addition to, whatever redirect URI Supabase's own
  Google provider uses (`https://<project-ref>.supabase.co/auth/v1/callback`)
  — both need to be registered on the same OAuth Client if Supabase is kept as
  the fallback.
- `packages/config/src/sso-config.ts`'s `SSO_CONFIG.cors.origins` (Better
  Auth's `trustedOrigins`) must include the actual frontend origin(s) —
  `https://hashpass.tech`, `https://www.hashpass.tech`, `https://dev.hashpass.tech`
  were missing until 2026-07-08 and would have made Better Auth reject
  requests from the production core domain.

Supabase fallback (only reached if Better Auth's own request errors):

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (or the active
  profile-specific equivalents)
- Supabase Google provider enabled in that Supabase project's dashboard — this
  is a per-project Dashboard toggle, not something set via code or env vars
- Supabase redirect allow-list entries for each frontend callback

The Directus bridge (`/api/auth/oauth/login` → Directus → `/api/auth/oauth/callback`)
still exists in the tree for compatibility but is not reachable from the
Google sign-in button anymore — see ["Do we still need Directus?"](#do-we-still-need-directus).

## Relevant Routes

- `apps/mobile-app/hooks/useAuth.ts` — `signInWithOAuth('google')` and `handleOAuthCallback` (Better-Auth-first routing)
- `packages/auth/src/providers/better-auth.ts` — `BetterAuthProvider.signInWithOAuth` / `.handleOAuthCallback`
- `apps/mobile-app/lib/server/better-auth.ts` — server-side Better Auth config (`socialProviders.google`, `allowedHosts`, `trustedOrigins`)
- `apps/mobile-app/lib/supabase.ts` — fallback path only
- `apps/mobile-app/app/(shared)/auth/callback.tsx`
- `apps/mobile-app/app/api/auth/[...auth]+api.ts` — Better Auth's catch-all handler
- `apps/mobile-app/app/api/auth/oauth/login+api.ts` / `callback+api.ts` — Directus bridge (rarely reached now)

## Schema migration {#schema-migration}

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

## OTP (One-Time Password) Flow — Native Mobile

HASHPASS native uses a 6-digit OTP code instead of magic links. The Lambda generates a token via Supabase Admin API, stores a mapping, and sends the code via custom email or SMS.

### Send (`POST /api/auth/otp`)

1. Call `supabase.auth.admin.generateLink({ type: 'magiclink', email })`.
2. Extract from the response:
   - `properties.hashed_token` → `tokenHash` (SHA256 of the raw token; used with GoTrue `token_hash` path)
   - `properties.email_otp` → `emailOtp` (raw token; used with GoTrue `{ email, token }` path)
   - `properties.verification_type` → `verificationType` (usually `'magiclink'`)
3. Store `{verificationType}::{tokenHash}::{emailOtp}` as `token_hash` in the `otp_codes` table alongside the 6-digit `code`, email, and expiry.
4. Send the 6-digit code via SMTP (Brevo) or Brevo transactional SMS.

### Verify (`POST /api/auth/otp/verify`)

1. Look up the `otp_codes` row by email + 6-digit code (not used, not expired).
2. Parse `token_hash` column: split on `::` to recover `verificationType`, `tokenHash`, `emailOtp`.
3. Mark the row `used = true` immediately (replay prevention).
4. Call GoTrue `/auth/v1/verify` directly (no Supabase JS client — avoids PKCE fields being injected):
   - **Primary**: `{ token_hash: tokenHash, type: verificationType }` — the most reliable path for magic link tokens.
   - **Fallback**: `{ email, token: emailOtp, type: verificationType }` — used if token_hash path fails for a recoverable reason.
   - Tries multiple `type` values (`magiclink`, `signup`, `email`) to survive GoTrue version quirks.
   - Stops immediately if the error is "expired/invalid" (no point retrying an expired token).
5. Return the GoTrue session (`access_token`, `refresh_token`) to the client.
6. Client calls `supabase.auth.setSession()` to establish the local session.

### Why we bypass the Supabase JS client for verify

`supabase.auth.verifyOtp({ token_hash, type })` internally appends `code_verifier` and other PKCE fields. GoTrue rejects this with "Only the token_hash and type should be provided". Using a raw `fetch()` to `/auth/v1/verify` avoids the issue entirely.

### Relevant files

- `apps/mobile-app/app/api/auth/otp+api.ts` — send endpoint
- `apps/mobile-app/app/api/auth/otp/verify+api.ts` — verify endpoint
- `apps/mobile-app/db/otp_codes.sql` — DB schema for otp_codes table

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

Mirrors the web precedence (see [Current Main Google Flow](#current-main-google-flow-as-of-2026-07-08)) so native and web users end up under the same Better Auth identity rather than diverging depending on platform. `BetterAuthProvider.signInWithIdToken` is implemented in `packages/auth/src/providers/better-auth.ts` using Better Auth's documented ["Sign in with ID Token"](https://www.better-auth.com/docs/concepts/oauth#sign-in-with-id-token) support — no new native SDK code, no extra user interaction, same `GoogleSignin` call as before.

### Required configuration

| Setting | Value |
|---------|-------|
| `EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN` | `true` (baked into bundle at CI build time) |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | OAuth 2.0 Web client ID from GCP (type: Web application) |
| GCP Android OAuth client SHA-1 | **App signing key certificate** SHA-1 from Play Console → App integrity → App signing |

**Critical:** Google Play re-signs the AAB with its own App Signing Key. The SHA-1 registered in GCP must be the **App signing key** from Play Console, NOT the upload key from your local keystore. Using the upload key SHA-1 causes `DEVELOPER_ERROR` at runtime.

| Key | SHA-1 |
|-----|-------|
| App signing key (Play, register this in GCP) | `38:54:0E:C7:01:A7:11:AF:EE:D0:80:B1:EC:D0:E1:09:09:B0:68:79` |
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

### Web Google sign-in falls back to Supabase (account picker shows a `*.supabase.co` domain instead of your own)

This means Better Auth's own attempt failed silently and the code fell through
to the Supabase fallback (by design — check the browser console for
`[useAuth] Better Auth Google sign-in failed/threw, falling back to Supabase: ...`).
Diagnose in this order — each was an actual bug found and fixed on 2026-07-08,
and any one of them alone reproduces this exact symptom:

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
   callback need to be registered on the same OAuth Client if Supabase is kept
   as fallback (which also needs the Supabase project's own callback
   registered separately).

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

### Other

- If Supabase redirects back but no session is created (fallback path only), verify the Supabase Google provider is enabled and the callback URL is in Supabase Allowed Redirect URLs. Note: "provider is not enabled" (`validation_failed`) is a per-project Supabase Dashboard toggle, not a code or env issue.
- If the browser lands on `/dashboard/explore?error=oauth_failed...`, check the API Lambda logs for the callback request ID.
- For `DEVELOPER_ERROR` on Android Google Sign-In: verify the SHA-1 in the GCP Android OAuth client is the **App signing key** SHA-1 from Play Console (not the upload key).
- If the system account picker is skipped and the previous account is reused: the user should tap **Reset Google Account** in Settings → Security, or sign out and back in.
- If login ever reaches the Directus bridge (`/api/auth/oauth/login`) unexpectedly for `provider=google` on web, that's itself a bug now — see ["Do we still need Directus?"](#do-we-still-need-directus).
