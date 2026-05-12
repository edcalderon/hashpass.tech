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

- [`apps/web-app/app/api/auth/[...auth]+api.ts`](../apps/web-app/app/api/auth/%5B...auth%5D+api.ts)
- [`apps/web-app/app/api/auth/oauth/login+api.ts`](../apps/web-app/app/api/auth/oauth/login+api.ts)
- [`apps/web-app/app/api/auth/oauth/google+api.ts`](../apps/web-app/app/api/auth/oauth/google+api.ts)
- [`apps/web-app/app/api/auth/oauth/callback+api.ts`](../apps/web-app/app/api/auth/oauth/callback+api.ts)
- [`apps/web-app/app/(shared)/auth/callback.tsx`](../apps/web-app/app/%28shared%29/auth/callback.tsx)

## Event Better Auth Flow

Event tenants (`https://bsl.hashpass.tech`, `https://bsl-dev.hashpass.tech`, and `https://bsl2025.hashpass.tech`) use Better Auth for Google social login. Main `hashpass.tech` remains on Directus.

1. Domain-aware auth selection resolves event tenants to `better-auth`.
2. The frontend calls Better Auth at `EXPO_PUBLIC_BETTER_AUTH_URL`, normally `https://api.hashpass.tech/api/auth` in production.
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

Run the Better Auth schema migration against the configured event database after changing Better Auth config:

```bash
pnpm exec @better-auth/cli migrate --config apps/web-app/lib/server/better-auth.ts
```

## Troubleshooting

- If login fails before Google opens, check the API route response from `/api/auth/oauth/login`.
- If Google returns an error, check the `state` cookie and the Google redirect URI registered in Google Cloud Console.
- If the API callback fails with `Failed to authenticate as admin`, verify the Directus admin row is local and the password matches the production env.
- If the browser lands on `/dashboard/explore?error=oauth_failed...`, check the API Lambda logs for the callback request ID.
- For Better Auth failures, check `/api/auth/ok`, `/api/auth/get-session`, Google redirect URI configuration, and whether cookies are being sent to `api.hashpass.tech`.
