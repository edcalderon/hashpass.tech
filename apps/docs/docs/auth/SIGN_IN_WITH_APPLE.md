# Sign in with Apple

This page describes the current HASHPASS Sign in with Apple integration. It is
intentionally safe to publish: it contains public Apple portal identifiers and
callback URLs, plus variable names and placeholders—not private keys, client
secrets, cookies, authorization codes, or token values.

**Production status (verified 2026-10-17):** Sign in with Apple completes on
iOS Safari/mobile browser and returns the user to the dashboard. The verified
runtime is `v1.9.119`, with both production and development API version
endpoints reporting that backend version.

## Supported clients

| Client | Button | Authentication path |
| --- | --- | --- |
| Web/PWA (including iOS Safari) | Shown | Better Auth OAuth; Apple redirects to the Better Auth callback |
| iOS | Shown | Native Apple sheet; the identity token is exchanged with Better Auth |
| Android | Hidden | Apple has no native Android SDK in this app |

Both web and iOS end in the same Better Auth account/session and then start the
existing Supabase bridge. This keeps passes, roles, and other Supabase-backed
features attached to the same user identity.

## Runtime flow

### Web and PWA

1. The auth screen calls `signInWithOAuth("apple")`.
2. Better Auth starts Apple OAuth using the Apple Service ID as the web client
   identifier.
3. Apple sends its `response_mode=form_post` response to the registered HTTPS
   callback:

   ```text
   https://<API_ORIGIN>/api/auth/callback/apple
   ```

4. The API Gateway/Lambda boundary preserves the request body and state cookie.
   The Apple callback adapter accepts only the expected urlencoded callback
   fields, converts the form POST into the equivalent Better Auth GET callback,
   and preserves the request cookie headers.
5. Better Auth validates the state, consumes the authorization code, creates
   the session cookie, and redirects the browser to the app callback route.
6. The app restores the Better Auth session and starts the Supabase bridge,
   then routes the user to the dashboard.

The same flow is used by desktop browsers and iOS Safari. `localhost` is not a
valid Apple return URL; use a registered HTTPS environment host for web testing.

### Verified iOS Safari behavior

The production verification path is:

1. Open `https://hashpass.tech/auth` in iOS Safari.
2. Tap **Continue with Apple** and complete the Apple sheet/passcode step.
3. Safari posts the Apple response to the API callback, briefly processes the
   callback, and returns to the HashPass app callback.
4. The Better Auth session is read and the user lands on the dashboard.

The browser callback is deliberately different from the native iOS flow below:
iOS Safari uses the web OAuth Service ID and browser callback; the installed
iOS app uses the native identity-token exchange and does not need a browser
callback after the native sheet.

### Production Apple portal configuration

The following public configuration is the known-good production setup. Keep
the Apple private key and all server secret values out of this documentation.

| Apple Developer field | Production value |
| --- | --- |
| Primary App ID | `7UG3Q53FQ3.tech.hashpass.app` (HASHPASS TECH) |
| Web Services ID / OAuth client ID | `tech.hashpass.signin` |
| Website domain | `api.hashpass.tech` |
| Development website domain | `api-dev.hashpass.tech` |
| Production return URL | `https://api.hashpass.tech/api/auth/callback/apple` |
| Development return URL | `https://api-dev.hashpass.tech/api/auth/callback/apple` |

Return URLs must match exactly, including `https://`, host, path, and the
absence of a trailing slash. Do not add a new Apple return URL without also
deploying and testing the corresponding environment. The production Services
ID is used for browser OAuth; the iOS bundle identifier is used as the second
Better Auth audience for native identity tokens.

### iOS

1. The same auth button invokes `expo-apple-authentication` through the iOS
   native adapter.
2. The system sheet requests the user's email and full name. Apple may only
   provide those fields on the first authorization.
3. The app sends the returned identity token to Better Auth's native
   `signIn.social({ provider: 'apple', idToken })` exchange. Better Auth
   returns the session token and user directly; iOS does **not** need a browser
   redirect after the PIN/passcode sheet closes.
4. `BetterAuthProvider` stores that direct session response and the Expo client
   persists its cookie state in SecureStore. The auth-state machine then routes
   the user into the app and starts the Supabase bridge.
5. The native exchange has a 15-second timeout so a network/configuration
   failure returns an actionable sign-in error instead of leaving the login
   screen indefinitely on “Please wait while your sign-in finishes.”
6. A cancelled sheet returns to the login screen without an error state.

The iOS build must include the Sign in with Apple capability and use the same
bundle identifier registered for the Apple App ID. Test this path on a signed
iOS build; a web preview cannot exercise the native sheet.

## Apple Developer setup

Use the Apple Developer portal to configure the following, substituting values
from the team's private records:

1. Enable **Sign in with Apple** on the production App ID.
2. Create a separate **Services ID** for web OAuth and register the HTTPS
   callback for each environment that offers Apple sign-in.
3. Create a **Sign in with Apple key** and download its `.p8` file once.
4. Keep the Sign in with Apple key separate from the **App Store Connect API
   key** used by Fastlane/TestFlight. They are different credentials and must
   not be swapped.

Do not put the values below in documentation, source control, `EXPO_PUBLIC_*`
variables, screenshots, or issue comments:

```text
BETTER_AUTH_APPLE_CLIENT_ID=<APPLE_SERVICE_ID>
BETTER_AUTH_APPLE_TEAM_ID=<APPLE_TEAM_ID>
BETTER_AUTH_APPLE_KEY_ID=<SIGN_IN_WITH_APPLE_KEY_ID>
BETTER_AUTH_APPLE_PRIVATE_KEY=<ENTIRE_P8_PRIVATE_KEY>
BETTER_AUTH_APPLE_BUNDLE_ID=<IOS_BUNDLE_ID>  # optional when using the default
```

The server also accepts the legacy aliases `APPLE_SERVICE_ID`,
`APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY`,
but the `BETTER_AUTH_APPLE_*` names are the canonical names for new setup.

### Secret storage

- **Production/shared environments:** store the canonical names in the team's
  secret manager (Infisical). The API reads them server-side.
- **Local development:** put the same names in the ignored root `.env` because
  `packages/tools/scripts/propagate-env.js local` generates
  `apps/mobile-app/.env.local` from that file. Do not edit the generated app
  file as the long-term source; Metro overwrites it on startup.
- Restrict the `.p8` file to mode `0600`, and rotate/revoke it in Apple
  Developer if it is exposed.

The API creates the short-lived ES256 Apple client-secret JWT at request time.
Do not generate, commit, or manually rotate that JWT. The Apple key itself is
the credential that must be protected and rotated.

## Verification checklist

After configuring secrets and building a signed iOS release:

- Web/PWA: start Apple OAuth from desktop Safari/Chrome and iOS Safari,
  complete consent, and verify the callback returns to the dashboard rather
  than the API host or the sign-in screen.
- iOS: verify the Apple sheet opens, test first-time consent, cancellation, a
  repeat sign-in, and **Hide My Email**.
- Confirm the Better Auth session exists and that the Supabase bridge creates
  the database session used by passes and roles.
- Confirm Android does not show an Apple button and still offers its supported
  sign-in methods.
- Check server logs for configuration errors without logging secret values.

For a release-level smoke test, also verify that `/api/config/versions`
reports the release backend version and that the Apple callback request does
not produce `State not found` in the API logs. A deliberately invalid code may
be used in a non-user diagnostic to confirm the callback reaches code exchange;
never log or paste a real Apple `code`, `state`, cookie, or ID token.

## Security and change-safety invariants

The following are intentional production safeguards and should remain covered
by tests when auth code changes:

- Apple web callbacks accept only `POST /api/auth/callback/apple` with an
  `application/x-www-form-urlencoded` body.
- The adapter forwards only Better Auth/Apple callback fields (`code`, `error`,
  `device_id`, `error_description`, `state`, `user`, and `iss`). It must not
  copy arbitrary form fields into the callback URL.
- API Gateway v2 cookies must be reconstructed into the request `Cookie` header
  so Better Auth can validate the state cookie. The state value is never a
  substitute for server-side validation.
- Base64 request bodies must be decoded as bytes. Converting them to UTF-8 can
  corrupt unrelated multipart support uploads.
- Apple credentials are resolved server-side from Infisical; the client must
  never receive the private key or generated client-secret JWT.
- The iOS Safari path must keep using the HTTPS API callback and the native
  iOS path must keep using the bundle-identifier audience. Do not merge the
  two flows by adding a browser redirect to the native token exchange.
- Do not log authorization codes, state values, cookies, Apple `user` payloads,
  identity tokens, private keys, or client-secret JWTs.

The route-level tests, Lambda body/cookie tests, CodeQL, secret scanning, and
release coverage gate are the minimum regression safety net. The deferred
weekly test matrix is tracked in the repository task
`.agents/pending/task-apple-auth-hardening.md`.

### Troubleshooting

- **“Sign in with Apple is not fully configured”**: one of the four required
  server values is absent. Check the root `.env` source and rerun local
  propagation, or verify the Infisical secret names.
- **Infisical `401`**: the secret-manager machine credential is invalid or
  expired. This is separate from Apple and must be fixed or rotated in the
  secret manager.
- **`redirect_uri_mismatch`**: the callback host is not registered on the Apple
  Services ID, or the request is using a localhost URL.
- **Native iOS unavailable**: install a new signed build containing the Apple
  capability; the web/PWA path cannot provide the native sheet.
- **The login screen stays on “Please wait while your sign-in finishes.”**: the
  Apple sheet succeeded but the native ID-token exchange did not return a
  session. Check API reachability and the Better Auth native client setup,
  especially the Expo SecureStore plugin in
  `packages/auth/src/providers/better-auth.ts`. iOS should receive a direct
  session response, not wait for a browser callback.

## Code references

- `apps/mobile-app/app/(shared)/auth.tsx` — Apple button and user-facing flow
- `apps/mobile-app/hooks/useAuth.ts` — web OAuth and native iOS token exchange
- `apps/mobile-app/lib/native-apple-signin.ios.ts` — native Apple sheet adapter
- `apps/mobile-app/lib/server/better-auth.ts` — server credentials, audiences,
  and client-secret generation
- `apps/mobile-app/lib/server/better-auth-route.ts` — Apple form-post
  normalization and allow-listed callback fields
- `packages/infra/lambda/index.js` — API Gateway cookie reconstruction and
  byte-preserving base64 request-body decoding
- `packages/tools/scripts/propagate-env.js` — local environment propagation
