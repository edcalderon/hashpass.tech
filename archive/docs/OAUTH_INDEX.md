# HashPass OAuth Testing Index

> Historical setup note: the current production flow is documented in [AUTH_FLOW.md](AUTH_FLOW.md). This index keeps the older local-testing guides reachable, but they are not the source of truth for production auth.

## Start Here

1. [LOCAL_OAUTH_TESTING.md](LOCAL_OAUTH_TESTING.md)
   - Legacy local setup guide
   - Troubleshooting notes
   - Environment switching

2. [OAUTH_TESTING_CHECKLIST.md](OAUTH_TESTING_CHECKLIST.md)
   - Pre-test checklist
   - Browser testing steps
   - Known failure modes

3. [OAUTH_SETUP_COMPLETE.md](OAUTH_SETUP_COMPLETE.md)
   - Setup summary
   - Historical implementation notes

4. [OAUTH_LOCAL_TESTING_SUMMARY.md](OAUTH_LOCAL_TESTING_SUMMARY.md)
   - Quick reference
   - Historical configuration snapshot

5. [OAUTH_VERIFICATION_REPORT.md](OAUTH_VERIFICATION_REPORT.md)
   - Endpoint verification results
   - Historical test output

## Current Auth

For the current Google sign-in path, use:

- [AUTH_FLOW.md](AUTH_FLOW.md)
- [`apps/mobile-app/app/api/auth/oauth/login+api.ts`](../apps/mobile-app/app/api/auth/oauth/login+api.ts)
- [`apps/mobile-app/app/api/auth/oauth/google+api.ts`](../apps/mobile-app/app/api/auth/oauth/google+api.ts)

## Quick Reminder

The current flow is:

1. Frontend calls `/api/auth/oauth/login`.
2. API redirects to Google.
3. Google returns to `/api/auth/oauth/google`.
4. API provisions the Directus user and returns tokens to the frontend.
