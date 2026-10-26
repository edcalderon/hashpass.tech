import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MCP_URL, PLUGIN_ROOT, REQUIRED_SCOPES, SERVER_NAME } from "./contract.mjs";

const ROOT = PLUGIN_ROOT;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read JSON at ${path}: ${error.message}`);
  }
}

export async function validatePlugin(root = ROOT) {
  const packageManifest = await readJson(resolve(root, "package.json"));
  const pluginManifest = await readJson(resolve(root, "plugin.json"));
  const mcpManifest = await readJson(resolve(root, "mcp.json"));

  assert.match(packageManifest.version, SEMVER, "package.json must contain a semantic version");
  assert.equal(pluginManifest.version, packageManifest.version, "plugin.json and package.json versions must match");
  assert.equal(pluginManifest.name, SERVER_NAME, "portable plugin name changed unexpectedly");
  assert.equal(pluginManifest["$schema"], "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  assert.equal(mcpManifest["$schema"], "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json");

  const pluginInterface = pluginManifest.extensions?.["com.openai"]?.interface;
  assert.equal(pluginInterface?.composerIcon, "./assets/hashpass-symbol.png");
  assert.equal(pluginInterface?.logo, "./assets/hashpass-symbol.png");
  assert.equal(pluginInterface?.defaultPrompt?.length, 3, "plugin should expose three onboarding prompts");
  const logoStats = await stat(resolve(root, "assets/hashpass-symbol.png"));
  assert.ok(logoStats.size > 0, "HASHPASS logo asset is empty");

  const servers = Object.entries(mcpManifest.mcpServers ?? {});
  assert.equal(servers.length, 1, "mcp.json must expose exactly one MCP server");
  const [serverName, server] = servers[0];
  assert.equal(serverName, SERVER_NAME);
  assert.equal(server.type, "streamable-http");
  assert.equal(server.url, MCP_URL);
  // A trailing slash makes this a different OAuth resource identifier.
  assert.equal(MCP_URL.endsWith("/"), false, "the MCP resource URL must not end with a slash");

  const auth = server.extensions?.["com.openai"]?.auth;
  assert.equal(auth?.type, "oauth");
  assert.equal(auth?.client?.mode, "dcr");
  assert.equal("clientId" in (auth.client ?? {}), false, "DCR must not package a client ID");
  assert.equal("clientSecret" in (auth.client ?? {}), false, "DCR must not package a client secret");
  assert.equal(auth.resource, MCP_URL);
  assert.deepEqual(auth.baseScopes, REQUIRED_SCOPES);

  const serializedConfig = JSON.stringify({ pluginManifest, mcpManifest });
  assert.equal(/(?:client[_-]?secret|access[_-]?token|private[_-]?key|api[_-]?key)/i.test(serializedConfig), false, "plugin metadata contains a credential-like field");

  return {
    name: pluginManifest.name,
    version: packageManifest.version,
    serverUrl: server.url,
    scopes: auth.baseScopes
  };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  validatePlugin()
    .then((result) => console.log(`Validated ${result.name} v${result.version} (${result.serverUrl})`))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
