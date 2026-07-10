# Authentication Structure

## Route Map

### Frontend routes

- `app/(shared)/auth.tsx` -> `/auth`
- `app/(shared)/auth/callback.tsx` -> `/auth/callback`
- `app/auth/index.tsx` -> `/auth/` trailing-slash compatibility
- `app/auth/callback/index.tsx` -> `/auth/callback/` trailing-slash compatibility

### API auth routes

- `app/api/auth/oauth/login+api.ts` -> `/api/auth/oauth/login`
- `app/api/auth/oauth/callback+api.ts` -> `/api/auth/oauth/callback`
- `app/api/auth/oauth/google+api.ts` -> legacy compatibility callback for older Google links

## Current Main Google Flow (updated 2026-07-08)

Main Google sign-in starts in `apps/mobile-app/hooks/useAuth.ts` through `signInWithOAuth('google')`.

**Web and native now try Better Auth first, for every tenant** (not just BSL events) — see [AUTH_FLOW.md](AUTH_FLOW.md#current-main-google-flow-as-of-2026-07-08) for the full sequence:

1. Web calls Better Auth's `signIn.social({ provider: 'google' })`, which redirects to Google with `redirect_uri=<apiBase>/api/auth/callback/google`.
2. Better Auth's own server exchanges the code, sets a session cookie, and redirects back to `/auth/callback`.
3. `app/(shared)/auth/callback.tsx` checks for a live Better Auth session first (via a `localStorage` marker set before the redirect) before falling back to the tenant's resolved provider.
4. Only if Better Auth's own request errors does the code fall back to `supabase.auth.signInWithOAuth({ provider: 'google' })`, which then follows the old `createSessionFromUrl()` PKCE-exchange path described below.
5. Native uses `@react-native-google-signin/google-signin` for the account picker, exchanges the Google ID token with Better Auth first, then falls back to `supabase.auth.signInWithIdToken()` only if Better Auth fails.

## Directus Fallback Flow (not reachable from the Google button)

This bridge still exists in the tree but nothing calls it for `provider=google` anymore — see [AUTH_FLOW.md § Do we still need Directus?](AUTH_FLOW.md#do-we-still-need-directus). Left here for reference in case a non-Google provider is ever wired up, or Google sign-in ever falls all the way through both Better Auth and Supabase:

The API:

1. Validates the `returnTo` path.
2. Stores return-target, frontend-origin, and optional native callback cookies.
3. Redirects to Directus with `redirect=https://api.hashpass.tech/api/auth/oauth/callback&mode=session`.
4. Lets Directus complete the Google handshake and return to `/api/auth/oauth/callback`.
5. Resolves the Directus response and returns either:
   - a web fragment redirect with the Directus tokens, or
   - a native `hashpass://auth/callback?...` redirect for the mobile app.

The frontend or native app then reads the returned tokens and hydrates the active session.

## Why `/auth/callback` Still Exists

The frontend callback route is still useful because it:

- normalizes token delivery on the client
- preserves compatibility with older local flows
- exchanges Supabase PKCE and token-hash callbacks
- handles trailing-slash redirects from static hosting
- returns native app redirects when `native_callback` is present

## Multi-Origin Support

The auth flow accepts multiple trusted frontend origins through environment configuration and runtime checks. The production path is currently centered on:

- `https://hashpass.tech`
- `https://dev.hashpass.tech`
- `https://api.hashpass.tech`
- `https://sso.hashpass.co`
- `http://localhost:8081` for local web development

For the latest operational flow and troubleshooting notes, see [AUTH_FLOW.md](AUTH_FLOW.md).
