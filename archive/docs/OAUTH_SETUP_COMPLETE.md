# OAuth Local Testing - Setup Complete

> Historical setup note: the current production flow is documented in [AUTH_FLOW.md](AUTH_FLOW.md). This file preserves the earlier local Directus-based setup that was used before the API-owned Google OAuth bridge.

## Summary

- Supabase graceful error handling was added for local API work.
- Local Directus was configured for OAuth testing.
- The older browser flow used Directus to complete OAuth and then forwarded tokens to the frontend.

## What Changed

Historical changes in this setup included:

- `apps/mobile-app/app/api/auth/oauth/login+api.ts`
- `apps/mobile-app/app/api/auth/oauth/callback+api.ts`
- `apps/directus/docker-compose.yml`
- `apps/directus/.env`

## Quick Start

1. Start Directus locally.
2. Run the web app dev server.
3. Open `http://localhost:8081/auth`.
4. Click Google sign-in.

For the current production flow, use [AUTH_FLOW.md](AUTH_FLOW.md) instead of this historical setup guide.
