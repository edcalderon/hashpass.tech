# Changelog

## [1.0.1] - 2026-10-26

- Add HASHPASS branding and document Plane workspace methods

## [1.0.0] - 2026-10-26

- Initial portable ChatGPT plugin package for the HASHPASS Plane MCP server.
- Uses Streamable HTTP at `https://mcp.hashpass.tech/mcp`.
- Uses OAuth Dynamic Client Registration and server discovery; no client secret is packaged.
- Requests the Plane read/write scopes together with the identity and refresh scopes required by the authorization flow.
- Uses the canonical HASHPASS cyan-and-red symbol for the plugin logo and composer icon.
