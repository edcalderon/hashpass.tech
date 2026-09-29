---
title: Plane MCP Authorization
---

# Plane MCP Authorization

The private Hashpass Plane MCP server uses OAuth 2.1 through Better Auth. Only
approved `@hashpass.tech` and `@hashpass.app` accounts can complete an
authorization request.

## Sign-in continuation

An MCP client begins an authorization-code request at the registered resource.
Better Auth signs the OAuth request parameters and returns their names in
`ba_param`. The Hashpass sign-in handoff preserves **only** those signed
parameters plus the signature; UI or router query parameters are deliberately
discarded.

Do not remove, reorder, or append authorization parameters during a login
handoff. Doing so invalidates the request signature and the consent page must
reject the request rather than grant access.

## Consent review

Before approving access, the consent screen shows the client name, client ID,
client website when provided, redirect destination, and requested scopes.
Treat a client name as self-declared. Confirm the redirect destination and
requested permissions before selecting **Allow access**.

The Plane service credential remains server-side. OAuth clients receive a
scoped token only; they never receive the Plane API token.

## Database migration

The Better Auth MCP plugin requires its own OAuth persistence tables, including
`jwks`, OAuth clients, tokens, and consents. Apply the registered profile—not
the generic Better Auth CLI migration—against the database the app is actually
using:

```bash
# Inspect first
node packages/tools/scripts/migrate-tenant-db.mjs \
  --profile better-auth-development --dry-run

# Apply to the development Better Auth database
node packages/tools/scripts/migrate-tenant-db.mjs \
  --profile better-auth-development
```

The profile prefers an explicit `BETTER_AUTH_DATABASE_URL_DEV` or
`BETTER_AUTH_DATABASE_URL`. If those are absent, it follows the same approved
development database fallbacks used by the application. Production migration is
performed only through the reviewed release procedure.
