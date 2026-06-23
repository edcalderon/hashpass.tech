# Authentication Flow

## Current Main Production Flow

HashPass main production (`https://hashpass.tech`) Google sign-in uses the API-owned OAuth bridge. The browser no longer relies on Directus session cookies from `sso.hashpass.co` to complete login.

1. The frontend calls `GET /api/auth/oauth/login?provider=google&returnTo=...`.
2. The API stores `oauth_return_to`, `oauth_frontend_origin`, and `oauth_google_state` cookies.
3. The API redirects the browser to Google with:
   - `redirect_uri=https://api.hashpass.tech/api/auth/oauth/google`
   - `scope=openid profile email`
4. Google sends the authorization `code` back to `GET /api/auth/oauth/google`.
5. The API exchanges the code with Google, loads the Google profile, and logs into Directus as the configured admin user.
6. The API creates or updates the Directus user record, normalizes it to a local provider, and gets Directus tokens for that user.
7. The API redirects back to the requested frontend path with `#access_token=...&refresh_token=...`.
8. The frontend auth layer reads the hash fragment and establishes the active session.

## Why This Exists

This bridge avoids the production cookie problem between:

- Frontend: `https://hashpass.tech`
- Directus: `https://sso.hashpass.co`

Cross-site Directus cookies were not reliable enough for the production browser flow, so the OAuth callback now runs through the API domain instead.

## Production Requirements

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `DEFAULT_ROLE_ID`
- `DIRECTUS_URL`
- `EXPO_PUBLIC_FRONTEND_URL`

The Directus admin account used by the API callback must be a local Directus user (`provider=default`) and remain active.

## Relevant Routes

- `apps/mobile-app/app/api/auth/[...auth]+api.ts`
- `apps/mobile-app/app/api/auth/oauth/login+api.ts`
- `apps/mobile-app/app/api/auth/oauth/google+api.ts`
- `apps/mobile-app/app/api/auth/oauth/callback+api.ts`
- `apps/mobile-app/app/(shared)/auth/callback.tsx`

## Event Better Auth Flow

Event tenants (`https://bsl.hashpass.tech` and `https://bsl-dev.hashpass.tech`) use Better Auth for Google social login. Main `hashpass.tech` remains on Directus.

1. Domain-aware auth selection resolves event tenants to `better-auth`.
2. The frontend calls Better Auth at `EXPO_PUBLIC_BETTER_AUTH_URL`, normally `https://api.hashpass.tech/api/auth` in production, while the browser runtime exposes public Supabase values through `window.__HASHPASS_RUNTIME__` for client-side helpers.
3. Better Auth handles Google OAuth at `/api/auth/*`, stores its session in secure cookies, and redirects back to `/auth/callback`.
4. The shared auth callback asks the active provider for the session, then routes the user to the requested event path.
5. Event API calls include credentials, and server-side `authenticateRequest()` validates the Better Auth cookie for event hosts.

Event production requirements:

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL=https://api.hashpass.tech/api/auth`
- `EXPO_PUBLIC_BETTER_AUTH_URL=https://api.hashpass.tech/api/auth`
- `BETTER_AUTH_DATABASE_URL` or `BSL_BETTER_AUTH_DATABASE_URL`
- `BETTER_AUTH_GOOGLE_CLIENT_ID` / `BETTER_AUTH_GOOGLE_CLIENT_SECRET` (or the existing `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`)
- Google OAuth redirect URI: `https://api.hashpass.tech/api/auth/callback/google`

When you sync production or development secrets, `packages/tools/scripts/util/setup-parameters.sh sync` keeps the BSL Better Auth subtree under `/hashpass/[env]/bsl/better-auth/` and preserves the public Supabase key aliases used by the browser runtime.

Run the Better Auth schema migration against the configured event database after changing Better Auth config:

```bash
pnpm exec @better-auth/cli migrate --config apps/mobile-app/lib/server/better-auth.ts
```

## OTP (One-Time Password) Flow — Native Mobile

HashPass native uses a 6-digit OTP code instead of magic links. The Lambda generates a token via Supabase Admin API, stores a mapping, and sends the code via custom email or SMS.

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

Android builds use the [`@react-native-google-signin/google-signin`](https://github.com/react-native-google-signin/google-signin) SDK (v16) instead of a browser popup when `EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN=true` is baked into the bundle at build time.

### How it works

```
Android native app
  └─ signInWithOAuth('google') called
        │  (nativeGoogleEnabled=true)
        ▼
  GoogleSignin.hasPlayServices()
        ▼
  GoogleSignin.configure({ webClientId: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID })
        ▼
  GoogleSignin.signIn()   ← system account picker (no browser popup)
        │
        ▼
  response.data.idToken   ← ID token from Google's servers
        ▼
  supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
        ▼
  Supabase session established → user logged in
```

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

- If login fails before Google opens, check the API route response from `/api/auth/oauth/login`.
- If Google returns an error, check the `state` cookie and the Google redirect URI registered in Google Cloud Console.
- If the API callback fails with `Failed to authenticate as admin`, verify the Directus admin row is local and the password matches the production env.
- If the browser lands on `/dashboard/explore?error=oauth_failed...`, check the API Lambda logs for the callback request ID.
- For Better Auth failures, check `/api/auth/ok`, `/api/auth/get-session`, Google redirect URI configuration, and whether cookies are being sent to `api.hashpass.tech`.
- For `DEVELOPER_ERROR` on Android Google Sign-In: verify the SHA-1 in the GCP Android OAuth client is the **App signing key** SHA-1 from Play Console (not the upload key).
- If the system account picker is skipped and the previous account is reused: the user should tap **Reset Google Account** in Settings → Security, or sign out and back in.
