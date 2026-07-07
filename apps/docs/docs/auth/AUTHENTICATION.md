# Authentication

HashPass uses a provider-agnostic auth layer in code. The current production Google sign-in path goes through the API-owned Directus OAuth bridge described in [AUTH_FLOW.md](AUTH_FLOW.md).

## What Happens In Production

1. The browser starts at `/api/auth/oauth/login?provider=google`.
2. The API validates the request, stores the return target and callback cookies, and redirects to Directus.
3. Directus performs the Google OAuth handshake.
4. Directus returns to `/api/auth/oauth/callback`.
5. The API resolves the Directus response, syncs the public user registry, and redirects:
   - web: back to the frontend with tokens in the URL fragment
   - native: to `hashpass://auth/callback?...` when the native callback cookie is present
6. The frontend or native auth layer consumes the returned tokens and hydrates the active session.

## Why This Design

- Production frontend and Directus run on different domains.
- Directus browser cookies were not reliable enough for the production redirect flow.
- The API bridge keeps the OAuth callback and Directus user provisioning server-side.
- BSL event tenants use Better Auth for Google login and share the API Gateway-backed `https://api.hashpass.tech/api/auth` endpoint in production.
- Browser-only helpers resolve public Supabase config from `window.__HASHPASS_RUNTIME__` when static bundle env lookups are incomplete, so the redirect URL does not need to carry the anon key.

## Required Environment

```bash
AUTH_PROVIDER=directus
DIRECTUS_URL=<DIRECTUS_URL>
EXPO_PUBLIC_FRONTEND_URL=https://hashpass.tech
```

Directus itself must be configured with a Google OAuth provider. If the Directus-to-Supabase sync bridge is enabled, the API also needs `EXPO_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

For the BSL event tenants, see [AUTH_FLOW.md](AUTH_FLOW.md) for the Better Auth variables and AWS SSM namespace.

## Related Code

- `apps/mobile-app/app/api/auth/oauth/login+api.ts`
- `apps/mobile-app/app/api/auth/oauth/callback+api.ts`
- `apps/mobile-app/app/(shared)/auth/callback.tsx`
- `apps/mobile-app/app/api/auth/oauth/google+api.ts` (legacy compatibility only)

## Notes

- Supabase remains available for legacy data and OTP/magic-link flows where enabled.
- The browser no longer depends on a Directus session cookie to finish Google sign-in in production.
- Historical Directus-first guides should be treated as reference material only if they mention the old `/api/auth/oauth/google` admin bootstrap.
