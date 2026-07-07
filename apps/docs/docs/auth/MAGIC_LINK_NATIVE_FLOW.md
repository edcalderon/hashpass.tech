# Magic Link & OTP Auth — Native App Flow

## Overview

HASHPASS supports two passwordless sign-in methods via Supabase:

| Method | How it works |
|--------|-------------|
| **Magic link** | User receives an email with a clickable link |
| **OTP code** | User receives a 6-digit code, enters it manually |

Both flows have distinct behavior depending on whether the request originates from the **web app** (browser) or the **native app** (Android/iOS).

## Magic Link — Web App

1. `supabase.auth.signInWithOtp()` called with `emailRedirectTo: https://hashpass.tech/auth/callback?returnTo=<path>`
2. Supabase sends the magic link email
3. User clicks link → browser opens `hashpass.tech/auth/callback?returnTo=<path>&code=<pkce_code>`
4. Callback detects `auth_signin_method=magic_link` in localStorage → runs `createSessionFromUrl()`
5. Supabase PKCE exchange: `exchangeCodeForSession(code)` (code verifier in localStorage)
6. Session established → redirect to `returnTo` path

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
- If the native relay fires but the app does not open (e.g., not installed), the web callback shows an "Open in HASHPASS App" button for a manual retry.

## OTP Code Flow

The OTP flow uses a custom API endpoint instead of Supabase's built-in OTP:

1. App calls `POST /api/auth/otp` with `{ email, delivery }` — **no auth header** (`skipAuth: true`)
2. Lambda calls `supabase.auth.admin.generateLink()` to create a magic link token
3. Lambda extracts the 6-digit OTP from the token and sends it via Brevo email/SMS
4. User enters code in the app
5. App calls `POST /api/auth/otp/verify` with `{ email, code }` — **no auth header**
6. Lambda calls `supabase.auth.verifyOtp({ email, token: code, type: 'magiclink' })`
7. Returns the Supabase session to the client

The OTP endpoints are **public** (no bearer token). The API client must use `skipAuth: true` to prevent adding an `Authorization` header, which would cause CORS failures and possible API Gateway rejections.

## Supabase Profile Selection (Server Side)

The Lambda selects a Supabase project based on the request origin:

| Request origin | Profile | Supabase project |
|---------------|---------|-----------------|
| `hashpass.tech`, `api.hashpass.tech` | `core-production` | Configured via `SUPABASE_SERVICE_ROLE_KEY` env var |
| `bsl.hashpass.tech` | `bsl-production` | Configured via `BSL_SUPABASE_SERVICE_ROLE_KEY` env var |
| `localhost`, `api-dev.hashpass.tech` | `core-development` | Dev credentials |

Profile logic lives in `apps/mobile-app/config/supabase-profiles.ts`. The server-side `readProcessEnv` always prefers live Lambda `process.env` values over Metro-baked build-time values, so Lambda env vars override any values baked into the bundle at build time.

## Auth Callback URL Allowlist

For magic links to redirect to `hashpass.tech/auth/callback` (instead of falling back to the Supabase project's Site URL), that URL must be in the Supabase project's **Allowed Redirect URLs** list in the Supabase dashboard. Check this if magic links start redirecting to `localhost` or another unexpected URL.
