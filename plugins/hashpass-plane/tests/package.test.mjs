import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { MCP_URL, readShippedServer, stripTrailingSlash } from "../scripts/contract.mjs";
import { validatePlugin } from "../scripts/validate.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("portable manifest and MCP config satisfy the package contract", async () => {
  const result = await validatePlugin(ROOT);
  assert.equal(result.name, "hashpass-plane");
  assert.match(result.version, /^\d+\.\d+\.\d+$/);
  assert.equal(result.serverUrl, MCP_URL);
});

test("the shipped mcp.json is the source the live check reads", async () => {
  const shipped = await readShippedServer(ROOT);
  assert.equal(shipped.url, MCP_URL);
  assert.equal(shipped.resource, MCP_URL);
  assert.ok(shipped.scopes.includes("plane:read") && shipped.scopes.includes("plane:write"));
});

test("stripTrailingSlash keeps issuer-derived URLs single-slashed", () => {
  assert.equal(stripTrailingSlash("https://x.test/api/auth/"), "https://x.test/api/auth");
  assert.equal(stripTrailingSlash("https://x.test/api/auth//"), "https://x.test/api/auth");
  assert.equal(stripTrailingSlash("https://x.test/api/auth"), "https://x.test/api/auth");
});

test("the package keeps its two release versions synchronized", async () => {
  const packageManifest = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  const pluginManifest = JSON.parse(await readFile(join(ROOT, "plugin.json"), "utf8"));
  assert.equal(pluginManifest.version, packageManifest.version);
});
