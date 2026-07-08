# Authentication

HASHPASS uses a provider-agnostic auth layer in code. Main Google sign-in prefers Supabase on web and native when public Supabase config is available; the API-owned Directus OAuth bridge remains the fallback path described in [AUTH_FLOW.md](AUTH_FLOW.md).

## What Happens In Production

1. The app calls `useAuth.signInWithOAuth('google')`.
2. If public Supabase config is present:
   - web calls `supabase.auth.signInWithOAuth()` and returns to `/auth/callback`
   - native uses the Google Sign-In SDK and exchanges the ID token with `supabase.auth.signInWithIdToken()`
3. The callback/session helper exchanges the Supabase PKCE code, URL tokens, or token hash and hydrates the Supabase session.
4. If public Supabase config is missing, the app falls back to `/api/auth/oauth/login?provider=google`, where the API-owned Directus bridge validates the request, stores callback cookies, and redirects to Directus.
5. Directus fallback callbacks return through `/api/auth/oauth/callback`, where the API resolves the Directus response, syncs the public user registry, and redirects with session data.

## Why This Design

- Supabase is the active session owner for passwordless auth, local web Google auth, and native SDK Google auth.
- The Directus bridge stays available for compatibility and for deployments that intentionally do not expose public Supabase auth config.
- Directus browser cookies were not reliable enough for the old production redirect flow, so fallback Directus OAuth still runs through the API bridge.
- BSL event tenants use Better Auth for Google login and share the API Gateway-backed `https://api.hashpass.tech/api/auth` endpoint in production.
- Browser-only helpers resolve public Supabase config from `window.__HASHPASS_RUNTIME__` when static bundle env lookups are incomplete, so the redirect URL does not need to carry the anon key.

## Required Environment

Preferred Supabase Google path:

```bash
EXPO_PUBLIC_SUPABASE_URL=<SUPABASE_URL>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<GOOGLE_WEB_CLIENT_ID>
EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN=true
```

Directus fallback path:

```bash
AUTH_PROVIDER=directus
DIRECTUS_URL=<DIRECTUS_URL>
EXPO_PUBLIC_FRONTEND_URL=https://hashpass.tech
```

Supabase must have the Google provider enabled and each frontend `/auth/callback` URL in its Allowed Redirect URLs. Directus itself only needs a Google OAuth provider when the Directus fallback bridge is used. If the Directus-to-Supabase sync bridge is enabled, the API also needs `EXPO_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

For the BSL event tenants, see [AUTH_FLOW.md](AUTH_FLOW.md) for the Better Auth variables and AWS SSM namespace.

## Related Code

- `apps/mobile-app/app/api/auth/oauth/login+api.ts`
- `apps/mobile-app/app/api/auth/oauth/callback+api.ts`
- `apps/mobile-app/app/(shared)/auth/callback.tsx`
- `apps/mobile-app/hooks/useAuth.ts`
- `apps/mobile-app/lib/supabase.ts`
- `packages/auth/src/providers/supabase.ts`
- `apps/mobile-app/app/api/auth/oauth/google+api.ts` (legacy compatibility only)

## Notes

- Supabase is the expected browser Google path whenever public Supabase config is present.
- The browser no longer depends on a Directus session cookie to finish Google sign-in.
- Historical Directus-first guides should be treated as reference material only if they mention the old `/api/auth/oauth/google` admin bootstrap.
