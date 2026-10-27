---
title: Plane MCP — first stable release
---

# Plane MCP: first stable release

The HASHPASS Plane MCP connection is confirmed working end to end and is
declared **stable as plugin v1.1.0**. This page records what "stable" covers,
what was verified and how, what broke on the way, and how to re-check it.

Status date: 2026-10-27. The connection was confirmed working by the project
owner from a real client. The read-only checks below were re-run against the
live endpoints the same day.

## What is stable

| Part | Where | Contract |
| --- | --- | --- |
| MCP endpoint | `https://mcp.hashpass.tech/mcp` (streamable HTTP) | No trailing slash. The OAuth resource is this exact string. |
| Authorization server | Better Auth at `https://api.hashpass.tech/api/auth` | OAuth 2.1, dynamic client registration, authorization code + PKCE, refresh tokens (`offline_access`, 30 days), JWT access tokens bound to the MCP resource. |
| Discovery | `https://mcp.hashpass.tech/.well-known/oauth-protected-resource/mcp` and `https://api.hashpass.tech/.well-known/oauth-authorization-server/api/auth` | Both must answer 200. |
| Sign-in and consent | `https://hashpass.tech/mcp/login/`, `https://hashpass.tech/mcp/consent/` | Trailing slash required (see [Plane MCP Authorization](./plane-mcp-authorization.md)). |
| Gateway | `packages/plane-mcp-gateway/` | Verifies issuer, audience, expiry, verified-email domain allowlist and per-action scope before replacing the caller's token with the server-side Plane credential. |
| Scopes | `plane:read`, `plane:write` | Reads need `plane:read`; every mutation needs `plane:write`. |
| Who may connect | Verified `@hashpass.app` and `@hashpass.tech` accounts | Anyone else is refused at consent or by the gateway. |
| Plugin package | `plugins/hashpass-plane/` | Connection metadata only. It holds no client ID, secret or token. |

The tool families, and which actions count as read or write, are listed in the
plugin README (`plugins/hashpass-plane/README.md`). The gateway classifies
actions in `packages/plane-mcp-gateway/src/policy.mjs`; an action it does not
know is not allowed.

### Pages

Self-hosted Plane has no page routes on its public API, so the upstream `page`
tool always returned 404. The gateway answers `page` calls itself through a
dedicated Plane account (`list`, `retrieve`, `create`, `update`, `archive`,
`delete`). This was exercised through the public path (OAuth, then the MCP
endpoint) on 2026-10-27: list, create, archive and delete of a throwaway page.
It relies on Plane's undocumented internal API, so after any Plane upgrade
create and read back a throwaway page before relying on it. Setup is in
`ops/self-hosted/mcp/README.md`.

## What was verified

Run on 2026-10-27, read-only, against production:

| Check | Result |
| --- | --- |
| `npm run plugin:plane:check-live` | Healthy: resource `https://mcp.hashpass.tech/mcp`, authorization server `https://api.hashpass.tech/api/auth`, registration endpoint `https://api.hashpass.tech/api/auth/oauth2/register`. |
| `GET https://api.hashpass.tech/.well-known/oauth-authorization-server/api/auth` | 200 |
| Unauthenticated `POST https://mcp.hashpass.tech/mcp` | 401 (the gateway refuses anonymous callers) |
| Real client connection and tool call | Confirmed working by the project owner. |
| `page` tool through the public path | Verified live earlier the same day (see above). |

Not covered by these checks: a full consent flow driven by automation. A bare
`curl` of the login or consent page returns 200 even when the signed query
string was lost, so only a real client connection started from scratch proves
the sign-in handoff.

## What broke, and why it is fixed

Three separate faults looked like "the MCP connection is not working". Check
them in this order if it regresses.

1. **Discovery returned 405 (fixed in v1.9.162).** MCP clients read RFC 8414
   metadata from `/.well-known/oauth-authorization-server/api/auth`. The route
   lives in a dot-directory (`_expo/functions/.well-known/`), and
   `actions/upload-artifact@v4` silently drops dot-directories, so the file
   never reached the API Lambda and `@expo/server` answered 405 for a route
   listed in its own manifest. The deploy workflows now set
   `include-hidden-files: true`, and `package-lambda.sh` fails the build when
   any file named in `routes.json` `apiRoutes` is missing from the bundle.
2. **Sign-in lost the signed request.** The static host redirects
   `/mcp/login` and `/mcp/consent` and drops the query string. Better Auth now
   emits the slashed URLs directly. Do not "clean" them.
3. **Wrong Plane workspace slug.** `PLANE_WORKSPACE_SLUG` must be `plane`. A
   wrong slug makes every Plane call return 403, which a client shows as a
   generic tool error.

## Re-checking the connection

From the repository root:

```bash
npm run plugin:plane:validate
npm run plugin:plane:test
npm run plugin:plane:check-live        # discovery documents; no credentials
curl -s -o /dev/null -w '%{http_code}\n' \
  https://api.hashpass.tech/.well-known/oauth-authorization-server/api/auth   # expect 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://mcp.hashpass.tech/mcp # expect 401
```

Then connect from a new ChatGPT conversation and complete sign-in and consent.
Never open the consent URL directly: it needs the signed parameters from a
fresh authorization request.

Gateway changes are deployed by `self-hosted-vps-deploy.yml` when
`packages/plane-mcp-gateway/**` or `ops/self-hosted/**` change on `main`. The
gateway reads its env file only at start, so after editing `plane.env` on the
host, recreate the gateway container (see `ops/self-hosted/mcp/README.md`).

## Versioning

The plugin follows semantic versioning and its version lives in
`plugins/hashpass-plane/plugin.json` and `package.json`, kept equal by
`npm run plugin:plane:bump`.

- **1.1.0** is the first stable release. From here a change to the endpoint,
  scopes or OAuth resource is a **minor** bump at least, and existing
  connections must be recreated because ChatGPT keeps the URL it read at
  install time.
- A fix that does not change the connection contract is a patch.
- Removing a scope or tool family, or changing who may connect, is major.
- Releases before 1.1.0 (1.0.x) were pre-stable.
