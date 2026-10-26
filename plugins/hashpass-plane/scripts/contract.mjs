// Single source of truth for the values the plugin scripts and tests pin.
//
// The shipped endpoint and scopes live in mcp.json. This module is the
// *expected* contract that validate.mjs enforces against it, so changing the
// MCP endpoint or scopes is a deliberate two-file edit (mcp.json + here)
// instead of a hunt through every script. check-live.mjs reads mcp.json
// directly and does not repeat these values.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PLUGIN_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const SERVER_NAME = "hashpass-plane";
export const MCP_URL = "https://mcp.hashpass.tech/mcp";
export const REQUIRED_SCOPES = ["openid", "profile", "email", "offline_access", "plane:read", "plane:write"];

/**
 * Remove trailing slashes from an issuer or endpoint before appending a path.
 * OAuth issuers are compared as exact strings, so `https://x/api/auth/` and
 * `https://x/api/auth` are different issuers, and `${base}//path` is a
 * different URL from `${base}/path`.
 */
export function stripTrailingSlash(url) {
  return url.replace(/\/+$/, "");
}

/** Read the shipped MCP server entry from mcp.json. */
export async function readShippedServer(root = PLUGIN_ROOT) {
  const manifest = JSON.parse(await readFile(resolve(root, "mcp.json"), "utf8"));
  const server = manifest.mcpServers?.[SERVER_NAME];
  if (!server) throw new Error(`mcp.json has no "${SERVER_NAME}" server`);
  const auth = server.extensions?.["com.openai"]?.auth;
  return { url: server.url, resource: auth?.resource ?? server.url, scopes: auth?.baseScopes ?? [] };
}
