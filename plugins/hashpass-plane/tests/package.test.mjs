import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { validatePlugin } from "../scripts/validate.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("portable manifest and MCP config satisfy the package contract", async () => {
  const result = await validatePlugin(ROOT);
  assert.equal(result.name, "hashpass-plane");
  assert.match(result.version, /^\d+\.\d+\.\d+$/);
  assert.equal(result.serverUrl, "https://mcp.hashpass.tech/mcp");
});

test("the package keeps its two release versions synchronized", async () => {
  const packageManifest = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  const pluginManifest = JSON.parse(await readFile(join(ROOT, "plugin.json"), "utf8"));
  assert.equal(pluginManifest.version, packageManifest.version);
});
