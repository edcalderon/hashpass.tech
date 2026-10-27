# HASHPASS Plane for ChatGPT

This is the portable plugin package for the private HASHPASS Plane MCP connection.
It contains the connection metadata ChatGPT needs and deliberately contains no
client ID, client secret, access token, cookie, or other credential.

## Upload the package

1. Run `npm run plugin:plane:package` from the repository root, or run `npm run package` in this directory.
2. Upload the generated `plugins/hashpass-plane/dist/hashpass-plane-v<version>.zip` in ChatGPT's **New Plugin** dialog.
3. Create the connection in a new ChatGPT conversation and complete the HASHPASS sign-in and consent screens.
4. If ChatGPT asks for a server URL instead of reading `mcp.json`, use `https://mcp.hashpass.tech/mcp`, choose **OAuth**, and choose **Dynamic Client Registration**. Do not paste a client ID or secret.

The browser may show `https://hashpass.tech/mcp/login/` and
`https://hashpass.tech/mcp/consent/` during OAuth. Those are the hosted login and
consent pages for the MCP server; do not replace them with the Plane web app URL
or open the consent page directly. Start a fresh connection from ChatGPT so the
signed authorization request is preserved.

## Source layout

- `plugin.json`: portable plugin identity and package version.
- `mcp.json`: the MCP endpoint and OpenAI OAuth/DCR configuration.
- `assets/hashpass-symbol.png`: the canonical HASHPASS symbol used for the plugin logo and composer icon.
- `scripts/validate.mjs`: checks the manifest, endpoint, scopes, version parity, and credential safety.
- `scripts/check-live.mjs`: read-only check of the MCP protected-resource and OAuth discovery documents.
- `scripts/build.mjs`: validates the package and produces a root-level ZIP accepted by the upload dialog.
- `scripts/bump.mjs`: updates `package.json`, `plugin.json`, and `CHANGELOG.md` together.
- `tests/`: Node's built-in test contract for the package.

## Where the endpoint and scopes live

`mcp.json` is the shipped source of truth for the MCP URL, OAuth resource, and
scopes. Nothing else should repeat them:

- `scripts/check-live.mjs` reads `mcp.json` and derives the discovery URLs from
  it. Set `HASHPASS_PLANE_MCP_URL` to point the same checks at a staging server
  without editing any file.
- `scripts/contract.mjs` holds the *expected* values (`MCP_URL`,
  `REQUIRED_SCOPES`). `scripts/validate.mjs` and the tests assert that
  `mcp.json` matches them, so an accidental edit to `mcp.json` fails
  `npm run validate`.

To change the MCP endpoint or scopes on purpose:

1. Edit `mcp.json`.
2. Edit the matching constants in `scripts/contract.mjs`.
3. Run `npm run validate`, `npm test`, and `npm run check:live`.
4. Run `npm run bump -- minor --note "Describe the change"` and re-upload the
   new archive. ChatGPT keeps the URL it read at install time, so existing
   connections must be recreated after an endpoint change.

## Trailing slashes

Slashes change meaning in this flow, and two different rules apply:

- **No trailing slash on the MCP resource** (`https://mcp.hashpass.tech/mcp`).
  OAuth compares the resource and issuer as exact strings, so `.../mcp/` is a
  different resource. `validate.mjs` rejects a resource ending in `/`.
  `check-live.mjs` strips trailing slashes from the issuer it discovers
  (`stripTrailingSlash`) before appending `/.well-known/...`, which prevents a
  `//` in the request path.
- **Trailing slash on the hosted login and consent pages**
  (`https://hashpass.tech/mcp/login/`, `https://hashpass.tech/mcp/consent/`).
  The static host redirects the slashless path and drops the query string, which
  loses the signed OAuth request ("authorization request is missing or
  invalid"). The server emits the slashed URLs; do not "clean" them. Details:
  `apps/docs/docs/auth/plane-mcp-authorization.md`.

A bare `curl` cannot catch the second problem because the redirected page still
returns 200. Verify with a real ChatGPT connection started from scratch.

## Available MCP methods

This plugin exposes the HASHPASS Plane MCP gateway as one OAuth-protected
connection. The gateway currently provides these tool families:

`collection`, `customer`, `customer_property`, `customer_request`, `cycle`,
`get_pql_reference`, `initiative`, `intake`, `label`, `member`, `milestone`,
`module`, `page`, `project`, `project_estimate`, `release`, `release_label`,
`release_tag`, `state`, `template`, `work_log`, `workitem`,
`workitem_activity`, `workitem_attachment`, `workitem_comment`,
`workitem_link`, `workitem_property`, `workitem_relation`, `workitem_type`,
and `workspace`.

Read operations include listing, searching, retrieving, counting, reading
members/roles/options/pages, project and workspace metadata, changelogs,
features, work logs, and download URLs. Write operations include creating,
updating, deleting, archiving, restoring, assigning, labeling, linking,
attaching, commenting, importing, transferring, resolving, and managing
members, pages, definitions, options, points, values, and work items.

The server enforces the access boundary: protocol discovery and read methods
require `plane:read`; mutations require `plane:write`. The OAuth identity and
HASHPASS email-domain policy are enforced by the gateway, so installing the
plugin does not grant access by itself.

At the protocol level ChatGPT uses `initialize`, `ping`, `tools/list`, and
`tools/call` (plus cancellation/initialization notifications). Tool actions are
classified by the gateway as follows:

- Read: `count`, `download_url`, `get_changelog`, `get_features`, `get_value`,
  `get_values`, `list`, `list_archived`, `list_definitions`, `list_members`,
  `list_options`, `list_pages`, `list_points`, `list_project`, `list_projects`,
  `list_roles`, `list_workitem_pages`, `list_workitems`, `list_workspace`,
  `me`, `read`, `retrieve`, `retrieve_by_identifier`, `retrieve_option`,
  `retrieve_role`, `search`, `search_pages`, `worklog_summary`.
- Write: `add_member`, `add_pages`, `add_projects`, `archive`, `attach`,
  `attach_to_workitem`, `complete`, `create`, `create_definition`,
  `create_option`, `create_points`, `delete`, `delete_definition`,
  `delete_option`, `delete_point`, `delete_value`, `detach`,
  `detach_from_workitem`, `import_to_project`, `link`, `manage_assignee`,
  `manage_label`, `manage_type_properties`, `manage_workitems`,
  `remove_member`, `remove_page`, `remove_projects`, `resolve`,
  `set_collection`, `set_value`, `set_values`, `transfer_workitems`,
  `unarchive`, `update`, `update_changelog`, `update_definition`,
  `update_features`, `update_member`, `update_option`, `update_point`,
  `upload_from_url`.

## Stability

`1.1.0` is the first stable release: the connection was confirmed working from a real client and the live
discovery checks pass. What that covers, and the semver rules from here on, are in
`apps/docs/docs/auth/plane-mcp-stable.md`.

## Versioning workflow

From this directory:

```sh
npm run validate
npm test
npm run check:live
npm run bump -- patch --note "Describe the plugin or auth contract change"
npm run package
```

The version in `package.json` is kept equal to the portable manifest version.
Every archive is named `hashpass-plane-v<version>.zip`, so a ChatGPT upload can
be tied back to the exact source package and changelog entry.

## Access and scopes

The server enforces the HASHPASS team-account policy. The package requests
`plane:read` and `plane:write`; remove `plane:write` from `mcp.json` if a
read-only connection is required. OAuth discovery supplies the authorization,
token, and dynamic-registration endpoints, so this package does not hard-code
environment-specific consent URLs.
