import assert from "node:assert/strict";
import { readShippedServer, stripTrailingSlash } from "./contract.mjs";

// Everything is derived from the shipped mcp.json. HASHPASS_PLANE_MCP_URL
// points the same checks at a staging server without editing this file.
const shipped = await readShippedServer();
const resourceUrl = process.env.HASHPASS_PLANE_MCP_URL?.trim() || shipped.resource;
const resourceOrigin = new URL(resourceUrl).origin;
const resourceMetadataUrl = `${resourceOrigin}/.well-known/oauth-protected-resource`;
const requiredScopes = shipped.scopes.filter((scope) => scope.includes(":"));

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  assert.equal(response.ok, true, `${url} returned HTTP ${response.status}`);
  return response.json();
}

const resourceMetadata = await fetchJson(resourceMetadataUrl);
assert.equal(resourceMetadata.resource, resourceUrl);
assert.ok(Array.isArray(resourceMetadata.authorization_servers));
assert.ok(resourceMetadata.authorization_servers.length > 0, "resource metadata has no authorization server");
assert.ok(requiredScopes.every((scope) => resourceMetadata.scopes_supported?.includes(scope)), "resource metadata is missing a Plane scope");

// The issuer is an exact-match string: drop a trailing slash before appending
// the well-known path so we never request `.../auth//.well-known/...`.
const authorizationServer = stripTrailingSlash(resourceMetadata.authorization_servers[0]);
const authorizationMetadata = await fetchJson(`${authorizationServer}/.well-known/oauth-authorization-server`);
assert.match(authorizationMetadata.authorization_endpoint, /^https:\/\//);
assert.match(authorizationMetadata.token_endpoint, /^https:\/\//);
assert.match(authorizationMetadata.registration_endpoint, /^https:\/\//);
assert.equal(authorizationMetadata.scopes_supported?.includes("offline_access"), true);

console.log(`Live MCP metadata is healthy: ${resourceUrl}`);
console.log(`Authorization server: ${authorizationServer}`);
console.log(`DCR endpoint: ${authorizationMetadata.registration_endpoint}`);
