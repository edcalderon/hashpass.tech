import assert from "node:assert/strict";

const RESOURCE_URL = "https://mcp.hashpass.tech/mcp";
const RESOURCE_METADATA_URL = "https://mcp.hashpass.tech/.well-known/oauth-protected-resource";
const REQUIRED_SCOPES = ["plane:read", "plane:write"];

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  assert.equal(response.ok, true, `${url} returned HTTP ${response.status}`);
  return response.json();
}

const resourceMetadata = await fetchJson(RESOURCE_METADATA_URL);
assert.equal(resourceMetadata.resource, RESOURCE_URL);
assert.ok(Array.isArray(resourceMetadata.authorization_servers));
assert.ok(resourceMetadata.authorization_servers.length > 0, "resource metadata has no authorization server");
assert.ok(REQUIRED_SCOPES.every((scope) => resourceMetadata.scopes_supported?.includes(scope)), "resource metadata is missing a Plane scope");

const authorizationServer = resourceMetadata.authorization_servers[0].replace(/\/$/, "");
const authorizationMetadata = await fetchJson(`${authorizationServer}/.well-known/oauth-authorization-server`);
assert.match(authorizationMetadata.authorization_endpoint, /^https:\/\//);
assert.match(authorizationMetadata.token_endpoint, /^https:\/\//);
assert.match(authorizationMetadata.registration_endpoint, /^https:\/\//);
assert.equal(authorizationMetadata.scopes_supported?.includes("offline_access"), true);

console.log(`Live MCP metadata is healthy: ${RESOURCE_URL}`);
console.log(`Authorization server: ${authorizationServer}`);
console.log(`DCR endpoint: ${authorizationMetadata.registration_endpoint}`);
