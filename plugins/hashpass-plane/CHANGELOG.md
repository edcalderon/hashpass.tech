# Changelog

## [1.0.3] - 2026-10-26

- Accept standard OIDC email claims in the MCP gateway

## [1.0.2] - 2026-10-26

- Derive checks from mcp.json, document slash rules, and ship against the fixed trailing-slash MCP login and consent pages.

## [1.0.1] - 2026-10-26

- Add HASHPASS branding and document Plane workspace methods

## [1.0.0] - 2026-10-26

- Initial portable ChatGPT plugin package for the HASHPASS Plane MCP server.
- Uses Streamable HTTP at `https://mcp.hashpass.tech/mcp`.
- Uses OAuth Dynamic Client Registration and server discovery; no client secret is packaged.
- Requests the Plane read/write scopes together with the identity and refresh scopes required by the authorization flow.
- Uses the canonical HASHPASS cyan-and-red symbol for the plugin logo and composer icon.
