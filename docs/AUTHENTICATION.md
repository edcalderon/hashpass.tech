# Authentication

HashPass uses a provider-agnostic auth layer in code, but the current production Google sign-in path goes through the API-owned OAuth bridge described in [AUTH_FLOW.md](AUTH_FLOW.md).

## What Happens In Production

1. The browser starts at `/api/auth/oauth/login?provider=google`.
2. The API validates the request, stores the return target and OAuth state, and redirects to Google.
3. Google returns to `/api/auth/oauth/google`.
4. The API exchanges the Google code, loads the Google profile, and logs into Directus as the configured admin user.
5. The API creates or updates the Directus user, normalizes the account to a local provider, and obtains Directus tokens.
6. The API redirects back to the frontend with the tokens in the URL fragment.
7. The frontend auth layer consumes the fragment and hydrates the active session.

## Why This Design

- Production frontend and Directus run on different domains.
- Directus browser cookies were not reliable enough for the production redirect flow.
- The API bridge keeps the Google callback and Directus user provisioning server-side.

## Required Environment

```bash
AUTH_PROVIDER=directus
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
DIRECTUS_URL=https://sso.hashpass.co
ADMIN_EMAIL=admin@hashpass.tech
ADMIN_PASSWORD=...
DEFAULT_ROLE_ID=...
EXPO_PUBLIC_FRONTEND_URL=https://hashpass.tech
```

The Directus admin account must be a local Directus user (`provider=default`) with an active status.

## Related Code

- [`apps/web-app/app/api/auth/oauth/login+api.ts`](../apps/web-app/app/api/auth/oauth/login+api.ts)
- [`apps/web-app/app/api/auth/oauth/google+api.ts`](../apps/web-app/app/api/auth/oauth/google+api.ts)
- [`apps/web-app/app/api/auth/oauth/callback+api.ts`](../apps/web-app/app/api/auth/oauth/callback+api.ts)
- [`apps/web-app/app/(shared)/auth/callback.tsx`](../apps/web-app/app/%28shared%29/auth/callback.tsx)

## Notes

- Supabase remains available for legacy data and OTP/magic-link flows where enabled.
- The browser no longer depends on a Directus session cookie to finish Google sign-in in production.
- Historical Directus-first guides should be treated as reference material only if they mention cookie-based OAuth.
