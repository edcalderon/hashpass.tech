# Authentication

HASHPASS uses a provider-agnostic auth layer in code, but as of 2026-07-08 **Google sign-in has one canonical path for every tenant: Better Auth first, Supabase as a last-resort fallback.** The Directus OAuth bridge described lower in this doc still exists in the tree but is not reachable from the Google button anymore — see [AUTH_FLOW.md § Do we still need Directus?](AUTH_FLOW.md#do-we-still-need-directus).

## What Happens In Production

1. The app calls `useAuth.signInWithOAuth('google')`.
2. **Web:** always tries Better Auth first — `signIn.social({ provider: 'google', ... })` against `<apiBase>/api/auth`, redirecting to Google with `redirect_uri=<apiBase>/api/auth/callback/google`. Better Auth's own server exchanges the code and sets a session cookie, then redirects to `/auth/callback`. Only if this itself errors does the code fall back to `supabase.auth.signInWithOAuth()`.
3. **Native:** uses the Google Sign-In SDK account picker, exchanges the ID token with `BetterAuthProvider.signInWithIdToken('google', idToken)` first, then falls back to `supabase.auth.signInWithIdToken()` only if Better Auth rejects the token or returns no session.
4. The web callback route (`/auth/callback`) checks for a live Better Auth session first (via the `auth_signin_method=google_oauth` marker set before the redirect), then falls back to the tenant's resolved provider (`authService`) only if that marker isn't present — see [AUTH_FLOW.md](AUTH_FLOW.md) for the full sequence.
5. The Directus bridge (`/api/auth/oauth/login` → Directus → `/api/auth/oauth/callback`) is unchanged in code but is not called by the Google button in any current flow.

## Why This Design

- A single Better Auth backend for Google avoids two divergent user identities (Better Auth's `ba_users` vs Supabase's `auth.users`) depending on which tenant/host resolved — that was happening under the brief Supabase-first design earlier the same day.
- Better Auth's account picker shows your own domain (`api.hashpass.tech`) instead of a raw Supabase project ref, which also fixes a real UX/trust concern on the consent screen.
- Supabase remains the active session owner for passwordless email/OTP auth (unrelated to this change) and as the Google fallback if Better Auth itself is misconfigured for a given environment.
- Directus never reliably held browser cookies across the frontend/Directus origin split in production, which is why even its own bridge always ran through the API domain rather than linking the frontend to Directus directly — this is now largely moot since nothing calls it for Google anymore.

## Required Environment

Better Auth Google path (default for every tenant on web):

```bash
BETTER_AUTH_SECRET=<...>
BETTER_AUTH_URL=https://api.hashpass.tech/api/auth
EXPO_PUBLIC_BETTER_AUTH_URL=https://api.hashpass.tech/api/auth
BETTER_AUTH_DATABASE_URL=<...>            # or DATABASE_URL / DATABASE_URL_PROD
BETTER_AUTH_GOOGLE_CLIENT_ID=<...>        # or GOOGLE_CLIENT_ID
BETTER_AUTH_GOOGLE_CLIENT_SECRET=<...>    # or GOOGLE_CLIENT_SECRET
```

Google Cloud Console must have `<apiBase>/api/auth/callback/google` registered as an authorized redirect URI for every environment (`https://api.hashpass.tech/...` and `http://localhost:8081/...` are separate entries on the same OAuth Client).

Supabase fallback path (only reached after Better Auth fails):

```bash
EXPO_PUBLIC_SUPABASE_URL=<SUPABASE_URL>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>
```

Supabase's own Google provider must be enabled in that project's Dashboard, and each frontend `/auth/callback` URL must be in its Allowed Redirect URLs, for the fallback to actually work when reached.

See [AUTH_FLOW.md](AUTH_FLOW.md) for the full requirements list, the schema-migration steps, and troubleshooting for each of the three infra bugs found and fixed on 2026-07-08 (Metro bundler blocking Better Auth's own `zod` dependency, `allowedHosts` not matching `host:port`, and Better Auth's database tables never having been migrated on a given environment).

## Related Code

- `apps/mobile-app/hooks/useAuth.ts` — `signInWithOAuth('google')` and `handleOAuthCallback` (Better-Auth-first routing)
- `packages/auth/src/providers/better-auth.ts` — `BetterAuthProvider`
- `apps/mobile-app/lib/server/better-auth.ts` — server-side Better Auth config
- `apps/mobile-app/app/(shared)/auth/callback.tsx`
- `apps/mobile-app/lib/supabase.ts` — fallback path only
- `apps/mobile-app/app/api/auth/oauth/login+api.ts` / `callback+api.ts` — Directus bridge (not reachable from the Google button anymore)

## Notes

- Better Auth is the expected browser Google path for every tenant now, not just BSL events.
- The browser no longer depends on a Directus session cookie to finish Google sign-in — it never did reliably, and now doesn't even try to for Google.
- Historical Directus-first guides should be treated as reference material only.
