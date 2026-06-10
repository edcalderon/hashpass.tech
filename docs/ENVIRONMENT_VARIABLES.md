# Environment Variables Reference

This is the current source of truth for the environment variables used by the HashPass web app, the shared sync scripts, and AWS Parameter Store.

## How Values Flow

- Root `.env` is the canonical source for shared values and environment-specific overrides.
- `npm run env:propagate dev` and `npm run env:propagate production` call `packages/tools/scripts/propagate-env.js`, which now resolves the repository root before writing `apps/web-app/.env` and related files.
- `node packages/tools/scripts/sync-env.js dev` and `node packages/tools/scripts/sync-env.js production` update runtime env exports from the root `.env` using the same repo-root resolver.
- `bash packages/tools/scripts/util/setup-parameters.sh sync dev` and `bash packages/tools/scripts/util/setup-parameters.sh sync production` sync AWS SSM parameters and remove stale entries.

## Canonical Key Rules

- `EXPO_PUBLIC_SUPABASE_URL` is the canonical public Supabase URL.
- `EXPO_PUBLIC_SUPABASE_KEY` is the canonical public anon key.
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` is a compatibility alias and is written by the env sync scripts.
- The same pattern applies to `_DEV` and `_PROD` overrides.
- BSL tenant-specific runtime helpers also accept `EXPO_PUBLIC_BSL_SUPABASE_*` aliases when those are present.

## Main Production

Main `hashpass.tech` still uses the API-owned Directus OAuth bridge.

```bash
AUTH_PROVIDER=directus
DIRECTUS_URL=<DIRECTUS_URL>
EXPO_PUBLIC_DIRECTUS_URL=<DIRECTUS_URL>
EXPO_PUBLIC_API_BASE_URL=<API_BASE_URL>
EXPO_PUBLIC_FRONTEND_URL=<FRONTEND_URL>
```

Required auth and database values:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `DEFAULT_ROLE_ID`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_KEY`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` if the target env expects the alias
- `SUPABASE_SERVICE_ROLE_KEY`

The production Google redirect allow-list should include both the browser callback and the API callback:

- `https://hashpass.tech/auth/callback`
- `https://api.hashpass.tech/api/auth/oauth/callback`

## BSL Event Production

BSL event tenants use Better Auth and share the API-hosted auth endpoint.

```bash
EXPO_PUBLIC_BETTER_AUTH_URL=<BETTER_AUTH_URL>
EXPO_PUBLIC_BETTER_AUTH_BASE_PATH=/api/auth
BETTER_AUTH_URL=<BETTER_AUTH_URL>
BETTER_AUTH_BASE_PATH=/api/auth
```

Required BSL auth values:

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_DATABASE_URL`
- `BSL_BETTER_AUTH_DATABASE_URL` as the legacy alias
- `BETTER_AUTH_GOOGLE_CLIENT_ID`
- `BETTER_AUTH_GOOGLE_CLIENT_SECRET`
- `BETTER_AUTH_TRUSTED_ORIGINS`

Required BSL Supabase values:

- `EXPO_PUBLIC_BSL_SUPABASE_URL_PROD`
- `EXPO_PUBLIC_BSL_SUPABASE_KEY_PROD`
- `BSL_SUPABASE_SERVICE_ROLE_KEY_PROD`
- `BSL_SUPABASE_DB_URL_PROD`
- The BSL CodeBuild buildspec is `packages/tools/buildspecs/infra-deploy.yml`, and the live pipeline projects are `bsl-hashpass-dev-build` and `bsl-hashpass-prod-build`.

The sync scripts also keep the public Supabase key aliases aligned for BSL browser helpers.

## Development

For local development, keep the root `.env` aligned with the local API and Directus hosts that are actually running on your machine.

Common local values in this repo:

```bash
DIRECTUS_URL=<LOCAL_DIRECTUS_URL>
EXPO_PUBLIC_DIRECTUS_URL=<LOCAL_DIRECTUS_URL>
EXPO_PUBLIC_API_BASE_URL=<LOCAL_API_BASE_URL>
```

For event development, the env propagation scripts derive the Better Auth URL from the development API base and keep the BSL aliases in sync.

## Sync Commands

Use these after changing the root `.env`:

```bash
npm run env:propagate dev
npm run env:propagate production
node packages/tools/scripts/sync-env.js dev
node packages/tools/scripts/sync-env.js production
bash packages/tools/scripts/util/setup-parameters.sh sync dev
bash packages/tools/scripts/util/setup-parameters.sh sync production
```

## Troubleshooting

- If the browser bundle looks like it lost public env values, verify `window.__HASHPASS_RUNTIME__` is being injected by the exported app shell.
- If Supabase login fails, confirm both `EXPO_PUBLIC_SUPABASE_KEY` and any required alias are aligned for the target environment.
- If BSL login fails, verify the `/hashpass/[env]/bsl/better-auth/` SSM subtree exists and that the derived `BETTER_AUTH_URL` matches the API host.
- If AWS sync drops an expected value, check the relevant `_DEV` or `_PROD` override in the root `.env`.
