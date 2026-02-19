# HashPass Directus SSO (Local Testing)

This app runs **Directus** for local auth/SSO testing. It does not contain application code—only Docker Compose and env configuration.

## Quick start

1. **Copy env and set values**
   ```bash
   cp .env.example .env
   # Edit .env: DIRECTUS_KEY, DIRECTUS_SECRET, DB_*, ADMIN_EMAIL, ADMIN_PASSWORD
   ```

2. **Start Directus**
   ```bash
   pnpm run up
   ```

3. **Use in app**
   - Set `EXPO_PUBLIC_DIRECTUS_URL=http://localhost:8055` (or your tunnel URL) in the web-app `.env`.
   - Directus admin: http://localhost:8055/admin (when running).

4. **Stop**
   ```bash
   pnpm run down
   ```

## From repo root

```bash
pnpm --filter hashpass-directus run up
pnpm --filter hashpass-directus run logs
pnpm --filter hashpass-directus run down
```

## Health check

```bash
curl -s http://localhost:8055/server/health
```

See parent `README.md` in this folder for full deployment and architecture notes.
