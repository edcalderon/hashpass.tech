# Private MCP runtimes

Hashpass MCP servers stay private on the VPS and connect to OpenAI through
outbound-only Secure MCP Tunnel profiles. Service credentials belong in
`/opt/hashpass/mcp/secrets`, never in the repository or tunnel profile.

The Plane profile runs the official Plane MCP server over stdio with a
root-owned wrapper. The unprivileged `hashpass-mcp` tunnel process may invoke
only that exact wrapper through sudo; it does not receive Docker-group access.

Required private files:

- `plane.env`: `PLANE_API_KEY`, `PLANE_WORKSPACE_SLUG`, and `PLANE_BASE_URL`.
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

The private runtime file `/opt/hashpass/mcp/secrets/plane.env` supplies only
`PLANE_API_KEY`, `PLANE_WORKSPACE_SLUG`, and `PLANE_BASE_URL`. Configure
`MCP_ALLOWED_EMAIL_DOMAINS` in the operator `.env`; domain access is accepted
only when the Hashpass OAuth token carries an explicit verified-email claim.
Optional `MCP_ALLOWED_EMAILS` and immutable `MCP_ALLOWED_SUBJECTS` entries can
grant narrower exceptions. Never place the Plane token in a browser, connector
form, or tracked file.
