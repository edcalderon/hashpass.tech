# Apple developer and Sign in with Apple

**Status: planned; not enabled in production (reviewed 2026-09-27).**

This is the source of truth for preparing the Apple account, automating App
Store Connect, and adding Sign in with Apple to HASHPASS. It intentionally
documents variable names and setup steps only; no private key, account ID, or
issuer ID belongs in this repository.

## What exists today

- The Expo app has the iOS bundle identifier `com.hashpass.tech`.
- App Store Connect contains **HASHPASS APP**, with iOS version **1.0** in
  *Prepare for Submission* according to the supplied console screenshot.
- The repository release version is currently `1.9.71`. A build may upload
  before its marketing-version record is created, but before selecting it for
  App Store release, create or select a version matching its
  `CFBundleShortVersionString`. Do not select a `1.9.71` build in the `1.0`
  release record.
- Google is the only social provider configured in Better Auth. The app has no
  active Apple provider configuration or credentials, native Apple
  authentication package, `ios.usesAppleSignIn` capability, Apple button, or
  Apple callback handling yet. The Apple variable names in the example
  environment file are reserved for this planned work and are not consumed by
  the current runtime.

The screenshot also shows no iPhone screenshots for the selected localization.
It is evidence of a draft store record, not a complete submission-readiness
audit: agreements, tax/banking, roles, bundle-ID capability, privacy answers,
metadata, builds, and review materials still need to be checked in Apple.

## Two separate Apple credentials

| Purpose | Credential | Needed now? | Never use it for |
| --- | --- | --- | --- |
| Store metadata, builds, TestFlight, and release automation | App Store Connect API key (`.p8`, key ID, issuer ID) | Optional until an automation workflow is added | Sign in with Apple OAuth |
| Web OAuth and native identity-token verification | Sign in with Apple key (`.p8`, key ID, Team ID) | Required before enabling the Apple button | App Store Connect API |

Apple has no Google-style service account for these tasks. An App Store Connect
API key is the automation credential. Use a narrowly scoped **team key** for
shared CI automation (normally the `App Manager` role for store/TestFlight
work); a personal/individual key is unsuitable as the durable CI credential.
Team keys are account-wide, so do not give it `Admin` unless a task actually
requires that power.

## App Store Connect API access

Do this only when we are ready to implement a store/TestFlight automation
workflow. A key alone grants no access to this assistant or the repository.

1. In App Store Connect, ask the Account Holder to approve API access if the
   **Users and Access → Integrations → App Store Connect API** page offers
   **Request Access**.
2. An Account Holder or Admin creates a **Team Key** at **Users and Access →
   Integrations → App Store Connect API → Team Keys → Generate API Key**.
3. Name it for its purpose, for example `hashpass-ci-app-store`, and select the
   smallest role that supports the intended workflow. Record the key ID and
   issuer ID, then download the `.p8` file immediately; Apple offers that
   download once.
4. Store the `.p8` in the approved secret manager / protected CI secret. Never
   commit it, paste it into chat, put it in an `EXPO_PUBLIC_*` variable, or
   upload it to EAS public environment variables.
5. Set only the following *names* in an ignored local `.env` or protected CI
   secret store when an automation script is introduced:

   ```bash
   APP_STORE_CONNECT_ISSUER_ID=<issuer UUID>
   APP_STORE_CONNECT_KEY_ID=<10-character key ID>
   APP_STORE_CONNECT_API_KEY_PATH=<ignored local path to AuthKey_<key-id>.p8>
   # CI alternative; protected secret, never a repository value:
   APP_STORE_CONNECT_PRIVATE_KEY=<PEM contents>
   ```

The current release scripts do not consume these variables, so setting them is
safe preparation only. We must add a reviewed workflow and a least-privilege
secret mapping before any programmatic account action is possible.

## Configure Sign in with Apple

Sign in with Apple uses the existing iOS App ID as its primary app and a
separate **Services ID** for browser and Android-browser OAuth.

1. In the Apple Developer account, open **Certificates, Identifiers &
   Profiles → Identifiers**, select the App ID for `com.hashpass.tech`, enable
   **Sign in with Apple**, and save it. Do not create a second App ID.
2. Create a Services ID with a new, reverse-domain identifier chosen by the
   account owner (for example, a unique `com.hashpass...web` identifier). Turn
   on Sign in with Apple and associate it with `com.hashpass.tech` as its
   primary App ID.
3. Register the production web domain and callback exactly:

   ```text
   Domain:     hashpass.tech
   Return URL: https://api.hashpass.tech/api/auth/callback/apple
   ```

   Register `www.hashpass.tech` only if it will initiate login. Register the
   development API hostname only when that environment is being tested:

   ```text
   Domain:     dev.hashpass.tech
   Return URL: https://api-dev.hashpass.tech/api/auth/callback/apple
   ```

   Apple requires absolute HTTPS return URLs. For local testing, use a
   temporary HTTPS tunnel with its own registered domain/return URL rather
   than documenting `localhost` as an Apple callback.
4. Under **Keys**, create a new key with **Sign in with Apple** enabled and
   associate it with the primary app. Download the `.p8` once, record its key
   ID, and record the Apple Developer Team ID. This is not the App Store
   Connect key from the prior section.
5. If any user may choose Hide My Email, configure Apple Private Email Relay
   for every actual outbound sender used by HASHPASS before production. The
   current templates name `info@hashpass.tech` and `no-reply@hashpass.info`;
   validate the active sender(s) and register their domains/sources in Apple
   before relying on mail to `@privaterelay.appleid.com` addresses.
6. Plan a TLS-protected server-to-server notification endpoint for Apple
   account and email-forwarding changes. It is not implemented today, so do
   not register a placeholder production URL.

### Server-only variables

Use the Services ID for browser authorization and retain the bundle ID for
native token audience validation:

```bash
BETTER_AUTH_APPLE_CLIENT_ID=<Apple Services ID for web>
BETTER_AUTH_APPLE_IOS_CLIENT_ID=com.hashpass.tech
BETTER_AUTH_APPLE_TEAM_ID=<Apple Developer Team ID>
BETTER_AUTH_APPLE_KEY_ID=<Sign in with Apple key ID>
BETTER_AUTH_APPLE_PRIVATE_KEY=<Sign in with Apple .p8 PEM; protected secret>
```

`BETTER_AUTH_APPLE_CLIENT_SECRET` is a server-only fallback for a signed Apple
client-secret JWT. Prefer generating that JWT from the Team ID, key ID, and
private key at runtime, rather than storing a static one. Apple client-secret
JWTs expire in no more than six months; a static secret needs monitored
rotation before it expires.

## Required implementation before enablement

The planned flow deliberately keeps Better Auth as the single social identity
authority. Do **not** add a separate Supabase Apple provider as a fallback;
that would recreate the divergent-identity problem already avoided for Google.

```text
Web
  Apple button → Better Auth signIn.social('apple')
  → Apple authorization code → /api/auth/callback/apple
  → Better Auth cookie session → /auth/callback

Native iOS
  AppleAuthentication.signInAsync({ nonce }) → identity token (+ nonce)
  → Better Auth signIn.social({ provider: 'apple', idToken: { token, nonce } })
  → verified Better Auth session

Native Android
  Apple button → deliberate browser OAuth + deep-link/session handoff
  → the same Better Auth web callback (not the iOS native API)
```

Implementation work must include:

1. Add `expo-apple-authentication`, its config plugin, and
   `ios.usesAppleSignIn: true` to `apps/mobile-app/app.json`; make a new iOS
   development/production build because this changes entitlements.
2. Add Better Auth's `socialProviders.apple` configuration in
   `apps/mobile-app/lib/server/better-auth.ts`. Map
   `BETTER_AUTH_APPLE_CLIENT_ID` to `clientId` (the web Services ID) and map
   `BETTER_AUTH_APPLE_IOS_CLIENT_ID` to `appBundleIdentifier`. The Services ID
   remains the Apple client-secret JWT `sub`; the bundle ID is only the native
   ID-token audience. Generate the client secret from the Team ID, key ID, and
   private key at runtime where possible.
3. Extend the provider types and `useAuth` flow, which currently accept only
   Google for Better Auth ID-token exchange. The Apple-capable method must pass
   `idToken: { token, nonce }`, rather than forwarding only a token. Use the
   native Apple sheet on iOS.
4. Add a branded Apple button only where the provider is configured. Ensure it
   is offered wherever a third-party social login is offered on iOS.
5. Implement Android separately: `expo-apple-authentication` is iOS-only and
   the current `BetterAuthProvider.signInWithOAuth` rejects non-Google
   providers. Use an intentional `expo-web-browser` + deep-link or equivalent
   browser/session-handoff path, then test it on a signed Android build. Do
   not assume the browser web implementation automatically works in native
   Android.
6. Add `https://appleid.apple.com` to Better Auth's trusted origins in the
   production configuration (the tracked template includes it). Apple posts
   its response from that origin; without this, Better Auth can reject the
   callback before it reaches the app.
7. Persist the Apple `sub` as the stable provider account identity. Email and
   full name can be returned only on initial consent, and the email can be a
   private relay address. Do not auto-link an Apple account to an existing
   Google account solely by matching an email; provide an explicit account
   linking decision/experience instead.
8. Keep the existing Better Auth → Supabase registry bridge and test that an
   Apple-created Better Auth user receives the same registry, role, and pass
   behavior as a Google-created user.

## Definition of done

Before the Apple button reaches production, test a first sign-in, returning
sign-in, Hide My Email, cancellation, expired/missing state, and a pre-existing
Google user on both the production-like web flow and a signed iOS build. Verify
the API callback uses `api.hashpass.tech`, the Better Auth cookie session is
present after the redirect, no token appears in the frontend URL, and outbound
email reaches a relay address. Also complete App Store Connect's version,
screenshots, privacy, review information, agreements, and build selection
separately; those store tasks are not performed by the Sign in with Apple key.

## Authoritative references

- [Apple: configure Sign in with Apple for the web](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web)
- [Apple: Sign in with Apple environment](https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple)
- [Apple: App Store Connect API keys](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/)
- [Expo AppleAuthentication](https://docs.expo.dev/versions/latest/sdk/apple-authentication/)
- [Better Auth OAuth providers](https://www.better-auth.com/docs/concepts/oauth)
