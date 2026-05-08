# Authentication Flow

## Current Production Flow

HashPass production Google sign-in now uses the API-owned OAuth bridge. The browser no longer relies on Directus session cookies from `sso.hashpass.co` to complete login.

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

- [`apps/web-app/app/api/auth/oauth/login+api.ts`](../apps/web-app/app/api/auth/oauth/login+api.ts)
- [`apps/web-app/app/api/auth/oauth/google+api.ts`](../apps/web-app/app/api/auth/oauth/google+api.ts)
- [`apps/web-app/app/api/auth/oauth/callback+api.ts`](../apps/web-app/app/api/auth/oauth/callback+api.ts)
- [`apps/web-app/app/(shared)/auth/callback.tsx`](../apps/web-app/app/%28shared%29/auth/callback.tsx)

## Troubleshooting

- If login fails before Google opens, check the API route response from `/api/auth/oauth/login`.
- If Google returns an error, check the `state` cookie and the Google redirect URI registered in Google Cloud Console.
- If the API callback fails with `Failed to authenticate as admin`, verify the Directus admin row is local and the password matches the production env.
- If the browser lands on `/dashboard/explore?error=oauth_failed...`, check the API Lambda logs for the callback request ID.
