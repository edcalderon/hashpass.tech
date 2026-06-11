# Authentication Structure

## Route Map

### Frontend routes

- `app/(shared)/auth.tsx` -> `/auth`
- `app/(shared)/auth/callback.tsx` -> `/auth/callback`
- `app/auth/index.tsx` -> `/auth/` trailing-slash compatibility
- `app/auth/callback/index.tsx` -> `/auth/callback/` trailing-slash compatibility

### API auth routes

- `app/api/auth/oauth/login+api.ts` -> `/api/auth/oauth/login`
- `app/api/auth/oauth/google+api.ts` -> `/api/auth/oauth/google`
- `app/api/auth/oauth/callback+api.ts` -> legacy compatibility callback used by older flows and tests

## Current Production Flow

Production Google sign-in starts at `/api/auth/oauth/login?provider=google`.

The API:

1. Validates the `returnTo` path.
2. Stores OAuth state and return-target cookies.
3. Redirects to Google with `redirect_uri=https://api.hashpass.tech/api/auth/oauth/google`.
4. Exchanges the Google code server-side.
5. Logs into Directus as the configured admin user.
6. Returns the Directus user tokens to the frontend in the URL fragment.

The frontend then reads the fragment and hydrates the active session.

## Why `/auth/callback` Still Exists

The frontend callback route is still useful because it:

- normalizes token delivery on the client
- preserves compatibility with older local flows
- handles trailing-slash redirects from static hosting

## Multi-Origin Support

The auth flow accepts multiple trusted frontend origins through environment configuration and runtime checks. The production path is currently centered on:

- `https://hashpass.tech`
- `https://api.hashpass.tech`
- `https://sso.hashpass.co`

For the latest operational flow and troubleshooting notes, see [AUTH_FLOW.md](AUTH_FLOW.md).
