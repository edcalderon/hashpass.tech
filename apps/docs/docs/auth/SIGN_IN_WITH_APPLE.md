# Sign in with Apple

This page describes the current HASHPASS Sign in with Apple integration. It is
intentionally safe to publish: it contains variable names and placeholders, not
Apple account identifiers, private keys, client secrets, or token values.

## Supported clients

| Client | Button | Authentication path |
| --- | --- | --- |
| Web/PWA | Shown | Better Auth OAuth; Apple redirects to the Better Auth callback |
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
3. Apple returns to the registered HTTPS callback:

   ```text
   https://<API_ORIGIN>/api/auth/callback/apple
   ```

4. Better Auth consumes the authorization code, creates the session cookie, and
   redirects the browser to the app callback route.
5. The app restores the Better Auth session and starts the Supabase bridge.

`localhost` is not a valid Apple return URL. Use a registered HTTPS environment
host for web testing.

### iOS

1. The same auth button invokes `expo-apple-authentication` through the iOS
   native adapter.
2. The system sheet requests the user's email and full name. Apple may only
   provide those fields on the first authorization.
3. The app sends the returned identity token to Better Auth's Apple ID-token
   exchange.
4. Better Auth accepts the iOS bundle-identifier audience, creates the same
   session type as web OAuth, and starts the Supabase bridge.
5. A cancelled sheet returns to the login screen without an error state.

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

- Web/PWA: start Apple OAuth, complete consent, and verify the callback returns
  to the app rather than the API host.
- iOS: verify the Apple sheet opens, test first-time consent, cancellation, a
  repeat sign-in, and **Hide My Email**.
- Confirm the Better Auth session exists and that the Supabase bridge creates
  the database session used by passes and roles.
- Confirm Android does not show an Apple button and still offers its supported
  sign-in methods.
- Check server logs for configuration errors without logging secret values.

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

## Code references

- `apps/mobile-app/app/(shared)/auth.tsx` — Apple button and user-facing flow
- `apps/mobile-app/hooks/useAuth.ts` — web OAuth and native iOS token exchange
- `apps/mobile-app/lib/native-apple-signin.ios.ts` — native Apple sheet adapter
- `apps/mobile-app/lib/server/better-auth.ts` — server credentials, audiences,
  and client-secret generation
- `packages/tools/scripts/propagate-env.js` — local environment propagation
