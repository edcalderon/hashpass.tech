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

## Current Production Flow

Production Google sign-in starts at `/api/auth/oauth/login?provider=google`.

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
- handles trailing-slash redirects from static hosting
- returns native app redirects when `native_callback` is present

## Multi-Origin Support

The auth flow accepts multiple trusted frontend origins through environment configuration and runtime checks. The production path is currently centered on:

- `https://hashpass.tech`
- `https://api.hashpass.tech`
- `https://sso.hashpass.co`

For the latest operational flow and troubleshooting notes, see [AUTH_FLOW.md](AUTH_FLOW.md).
