# Magic Link & OTP Auth — Native App Flow

## Overview

HASHPASS supports two passwordless sign-in methods via Supabase:

| Method | How it works |
|--------|-------------|
| **Magic link** | User receives an email with a clickable link |
| **OTP code** | User receives a 6-digit code, enters it manually |

Both flows have distinct behavior depending on whether the request originates from the **web app** (browser) or the **native app** (Android/iOS).

## Magic Link — Web App

1. `supabase.auth.signInWithOtp()` called with `emailRedirectTo: https://hashpass.tech/auth/callback`
2. Supabase sends the magic link email
3. User clicks link → browser opens `hashpass.tech/auth/callback?code=<pkce_code>`
4. Callback detects `auth_signin_method=magic_link` in localStorage → runs `createSessionFromUrl()`
5. Supabase PKCE exchange: `exchangeCodeForSession(code)` (code verifier in localStorage)
6. Session established → redirect to the safe dashboard default

The web redirect must remain the exact approved callback URL. In particular,
do not append a `returnTo` query parameter to `emailRedirectTo`: Supabase
rejects a callback that does not exactly match its redirect allowlist and
falls back to the Site URL without an auth payload.

The callback parser reads auth payloads from normal query params, hash fragments, and encoded native relay fragments. This covers both PKCE links (`?code=...`) and older implicit links (`#access_token=...&type=email`) so a successful Supabase callback must establish a session before the app redirects to the dashboard.

## Magic Link — Native App

The native app cannot open a web redirect and capture the session directly. Instead it uses a **web relay**:

```
Native app
  └─ supabase.signInWithOtp({ emailRedirectTo: 'https://hashpass.tech/auth/callback?returnTo=...&nativeRelay=1' })
        │
        ▼
  User taps link in Gmail / email client
        │  (opens Chrome Custom Tabs — an in-app browser)
        ▼
  hashpass.tech/auth/callback?returnTo=...&nativeRelay=1&code=<pkce_code>
        │
        ▼
  Web callback detects nativeRelay=1
        │  Builds Android Intent URL:
        │  intent://auth/callback?...#Intent;scheme=hashpass;package=com.hashpass.tech;end
        ▼
  Chrome Custom Tabs passes Intent to Android system
        │
        ▼
  HASHPASS native app opens
        │
        ▼
  Native callback: params.code present → createSessionFromUrl()
        │  (PKCE code verifier is in AsyncStorage from step 1)
        ▼
  exchangeCodeForSession(code) → session established
```

### Why Android Intent URLs (not `hashpass://`)

Email clients on Android open links in **Chrome Custom Tabs** (an in-app popup browser), not in the system Chrome. Custom Tabs block custom-scheme navigation (`hashpass://`) for security. Android **Intent URLs** (`intent://...#Intent;scheme=...;package=...;end`) ARE handled by Custom Tabs — Chrome passes them to the Android intent system which opens the registered app.

The web callback detects Android via user agent and switches between formats:
- Android → `intent://auth/callback?...#Intent;scheme=hashpass;package=com.hashpass.tech;end`
- iOS / desktop → `hashpass://auth/callback?...`

### Key Invariants

- The **PKCE code verifier** is stored in native AsyncStorage. The web callback page cannot exchange the code — it must relay to the native app.
- `auth_signin_method` is set in native AsyncStorage (not the web browser's localStorage). The web callback cannot read it, so it detects the magic link by checking for a `code` param + `nativeRelay=1`.
- Hosted origins take precedence over local development defaults. `dev.hashpass.tech` must generate `https://dev.hashpass.tech/auth/callback`, and native relay links must not fall back to `http://localhost:8081` unless the caller explicitly runs a local web flow.
- If the native relay fires but the app does not open (e.g., not installed), the web callback shows an "Open in HASHPASS App" button for a manual retry.

## OTP Code Flow

The native OTP flow is a custom public API, separate from the browser PKCE
magic-link flow described above. The canonical implementation and schema
description live in [AUTH_FLOW.md § OTP and SMS Authentication](./AUTH_FLOW.md#otp-and-sms-authentication).

At a high level:

1. The app calls `POST /api/auth/otp` with `{ email, delivery }` — no bearer
   token (`skipAuth: true`).
2. The server creates a GoTrue token, generates a CSPRNG six-digit code, and
   stores only a keyed HMAC verifier in `public.otp_codes`.
3. The code is delivered by email, or by SMS as part of the separately
   verified phone-registration flow.
4. The app calls `POST /api/auth/otp/verify` with `{ email, code }` — again with
   `skipAuth: true`.
5. The server atomically consumes the HMAC verifier, then calls GoTrue's verify
   endpoint with the anon key for the same Supabase project and returns the
   session.

The endpoints remain public, but rate limits, ten-minute expiry, five-attempt
locking, single-use consumption, and service-role-only database access are
mandatory. Never reintroduce plaintext OTP storage or a second OTP table.

## Supabase Profile Selection (Server Side)

The Lambda selects a Supabase project based on the request origin:

| Request origin | Profile | Supabase project |
|---------------|---------|-----------------|
| `hashpass.tech`, `bsl.hashpass.tech`, `api.hashpass.tech` | `core-production` | Configured via `SUPABASE_SERVICE_ROLE_KEY` env var |
| `localhost`, `api-dev.hashpass.tech` | `core-development` | Dev credentials |

Profile logic lives in `apps/mobile-app/config/supabase-profiles.ts`. The server-side `readProcessEnv` always prefers live Lambda `process.env` values over Metro-baked build-time values, so Lambda env vars override any values baked into the bundle at build time.

OTP verification has one extra guard: it decodes the service-role JWT project ref and selects the public Supabase URL and anon key whose URL host matches that ref. This prevents `Invalid API key` responses when the Lambda has a valid service-role key but the generic public anon variables point at a different Supabase project.

The API Lambda deploy script syncs the public Supabase URL/key aliases and frontend/API URL variables from the GitHub Actions environment before updating Lambda code. It preserves existing secret variables such as `SUPABASE_SERVICE_ROLE_KEY`, so secret rotation remains separate from the public config sync.

## Auth Callback URL Allowlist

For magic links to redirect to `hashpass.tech/auth/callback` (instead of falling back to the Supabase project's Site URL), that URL must be in the Supabase project's **Allowed Redirect URLs** list in the Supabase dashboard. Check this if magic links start redirecting to `localhost` or another unexpected URL.

Production and development Supabase projects must both allow their hosted callback URLs: `https://hashpass.tech/auth/callback` and `https://dev.hashpass.tech/auth/callback`.
