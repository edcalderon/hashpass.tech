import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const compose = await readFile(new URL("../mcp/compose.yaml", import.meta.url), "utf8");
const caddy = await readFile(new URL("../caddy/Caddyfile", import.meta.url), "utf8");
const deploy = await readFile(new URL("../deploy.sh", import.meta.url), "utf8");

test("pins the official Plane MCP server and keeps it off host ports", () => {
  assert.match(compose, /image: makeplane\/plane-mcp-server:v0\.3\.3/);
  assert.doesNotMatch(compose, /^\s+ports:/m);
  assert.match(compose, /PLANE_MCP_UPSTREAM_URL: http:\/\/plane-mcp-http:8211\/http\/api-key\/mcp/);
});

test("injects the Plane credential only into the OAuth gateway", () => {
  const [upstream, gateway = ""] = compose.split(/\n  plane-mcp-gateway:/);
  assert.doesNotMatch(upstream, /secrets\/plane\.env/);
  assert.match(gateway, /\/opt\/hashpass\/mcp\/secrets\/plane\.env/);
  assert.match(gateway, /MCP_ALLOWED_EMAILS:/);
});

test("publishes only the OAuth gateway through Caddy", () => {
  assert.match(caddy, /\{\$MCP_DOMAIN:mcp\.example\.invalid\}/);
  assert.match(caddy, /reverse_proxy plane-mcp-gateway:8220/);
  assert.doesNotMatch(caddy, /reverse_proxy plane-mcp-http/);
});

test("validates and reloads Caddy after deploying mounted route changes", () => {
  const edgeUp = deploy.indexOf("-f compose.yaml up -d");
  const validate = deploy.indexOf("caddy validate --config /etc/caddy/Caddyfile");
  const reload = deploy.indexOf("caddy reload --config /etc/caddy/Caddyfile");

  assert.ok(edgeUp >= 0);
  assert.ok(validate > edgeUp);
  assert.ok(reload > validate);
});
