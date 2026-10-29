# Private MCP runtimes

Hashpass MCP servers stay private on the VPS and connect to OpenAI through
outbound-only Secure MCP Tunnel profiles. Service credentials belong in
`/opt/hashpass/mcp/secrets`, never in the repository or tunnel profile.

The Plane profile runs the official Plane MCP server over stdio with a
root-owned wrapper. The unprivileged `hashpass-mcp` tunnel process may invoke
only that exact wrapper through sudo; it does not receive Docker-group access.

Required private files:

- `plane.env`: `PLANE_API_KEY`, `PLANE_WORKSPACE_SLUG`, and `PLANE_BASE_URL`.
  `PLANE_WORKSPACE_SLUG` must be `plane`, the slug in the Plane URL
  (`https://work.hashpass.tech/plane/...`). A wrong slug such as `hashpass`
  makes every Plane call return 403, which an MCP client shows as a generic
  tool error.
- To enable the gateway's session-backed `page` tool, add the dedicated
  service-account credentials `PLANE_PAGES_EMAIL` and `PLANE_PAGES_PASSWORD`
  to the same private file. Without both values, page calls continue to the
  upstream MCP server. Never reuse an end-user credential or commit these
  values.
- `openai-plane-tunnel.env`: `CONTROL_PLANE_API_KEY` only.

The tunnel profile is initialized with the OpenAI tunnel ID and this command:

```text
sudo -n /usr/local/libexec/hashpass-plane-mcp
```

Validate with `tunnel-client doctor --profile hashpass-plane --explain` before
enabling the systemd unit. Keep Plane and Helpdesk on separate tunnel IDs so
their tool inventories and access policies remain independently reviewable.

The Helpdesk wrapper runs the repository-owned read-only MCP server as the
`hashpass-mcp` service identity. It strips OpenAI control-plane variables before
starting Node and reads only the dedicated Frappe reader credentials.

## Standard remote OAuth endpoint

Users without OpenAI Secure MCP Tunnel connect to
`https://mcp.hashpass.tech/mcp`. Caddy exposes only the gateway. The official
Plane MCP v0.3.3 PAT endpoint remains private on `hashpass-ops`, and its Plane
service token is replaced server-side after the caller's Hashpass OAuth token
passes issuer, audience, expiry, account allowlist, and per-action scope checks.

Better Auth at `https://api.hashpass.tech/api/auth` provides OAuth 2.1 dynamic
client registration, authorization-code + PKCE, consent, refresh-token
rotation, JWKS discovery, and audience-bound JWT access tokens. Apply database
migration `V106__better_auth_mcp_oauth.sql` before enabling the auth plugin.

The private runtime file `/opt/hashpass/mcp/secrets/plane.env` supplies
`PLANE_API_KEY`, `PLANE_WORKSPACE_SLUG`, and `PLANE_BASE_URL`, plus the
optional page service-account credentials described above. Configure
`MCP_ALLOWED_EMAIL_DOMAINS` in the operator `.env` must be exactly
`hashpass.app,hashpass.tech`. Domain access is accepted only when the Hashpass
OAuth token carries an explicit verified-email claim. The deployment preflight
rejects a missing, duplicate, or external domain rather than broadening the
private MCP boundary.
Optional `MCP_ALLOWED_EMAILS` and immutable `MCP_ALLOWED_SUBJECTS` entries can
grant narrower exceptions. Never place the Plane token in a browser, connector
form, or tracked file.

## Plane pages (optional page service account)

Self-hosted Plane Community has no page routes on its public `/api/v1` (verified through v1.4.3-rc2 and the
`preview` branch), so the upstream MCP server's `page` tool always returns 404 there, whatever its version. Pages
only exist on the web app's own session-authenticated API.

When `PLANE_PAGES_EMAIL` and `PLANE_PAGES_PASSWORD` are set in `/opt/hashpass/mcp/secrets/plane.env`, the gateway
answers `page` tool calls itself (`packages/plane-mcp-gateway/src/plane-pages.mjs`): it signs in to Plane with that
account, keeps the session in memory, and re-signs in when Plane rejects it. All other tools still go to
`plane-mcp-http` unchanged. Without those two variables, page calls keep going upstream and fail as before.

- Use a **dedicated** Plane account (email + password sign-in must be enabled on the instance) that is an
  Admin or Member of the HASHPASS project. Do not reuse a person's login, and never put the password in a
  tracked file, tunnel profile or connector form.
- Supported actions: `list`, `retrieve`, `create`, `update`, `archive` (`archive=false` restores), `delete`
  (Plane requires the page to be archived first). `project_id` is required; workspace-level pages, collections and
  work-item attachment are not available on this edition.
- OAuth scopes still apply: `list` and `retrieve` need `plane:read`, the rest need `plane:write`.
- This rests on Plane's undocumented internal API. After any Plane upgrade, create and read back a throwaway page
  before relying on it.
