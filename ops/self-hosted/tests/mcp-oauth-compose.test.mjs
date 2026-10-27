import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const compose = await readFile(new URL("../mcp/compose.yaml", import.meta.url), "utf8");
const caddy = await readFile(new URL("../caddy/Caddyfile", import.meta.url), "utf8");
const deploy = await readFile(new URL("../deploy.sh", import.meta.url), "utf8");
const validateMcpAccessPolicy = "ops/self-hosted/scripts/validate-mcp-access-policy.sh";
const execFileAsync = promisify(execFile);

async function validateAccessPolicy(dotenv) {
  const directory = await mkdtemp(join(tmpdir(), "hashpass-mcp-policy-"));
  const environmentFile = join(directory, ".env");

  try {
    await writeFile(environmentFile, dotenv, "utf8");
    const result = await execFileAsync("bash", [validateMcpAccessPolicy, environmentFile], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    return { exitCode: 0, output: `${result.stdout}${result.stderr}` };
  } catch (error) {
    return {
      exitCode: error.code,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

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
  assert.match(gateway, /MCP_ALLOWED_EMAIL_DOMAINS:/);
});

test("requires the exact Hashpass email-domain allowlist without leaking dotenv values", async (t) => {
  const valid = await validateAccessPolicy("MCP_ALLOWED_EMAIL_DOMAINS= HashPass.Tech , HASHPASS.APP \n");
  assert.equal(valid.exitCode, 0, valid.output);

  for (const invalidCase of [
    {
      dotenv: "MCP_POLICY_TEST_MARKER=missing-variable-sentinel\n",
      hiddenValues: ["missing-variable-sentinel"],
    },
    {
      dotenv: "MCP_ALLOWED_EMAIL_DOMAINS=hashpass.app\nMCP_POLICY_TEST_MARKER=missing-domain-sentinel\n",
      hiddenValues: ["hashpass.app", "missing-domain-sentinel"],
    },
    {
      dotenv: "MCP_ALLOWED_EMAIL_DOMAINS=hashpass.app, HASHPASS.APP, hashpass.tech\nMCP_POLICY_TEST_MARKER=duplicate-sentinel\n",
      hiddenValues: ["hashpass.app, HASHPASS.APP, hashpass.tech", "duplicate-sentinel"],
    },
    {
      dotenv: "MCP_ALLOWED_EMAIL_DOMAINS=hashpass.app,hashpass.tech,external.example\nMCP_POLICY_TEST_MARKER=extra-domain-sentinel\n",
      hiddenValues: ["hashpass.app,hashpass.tech,external.example", "extra-domain-sentinel"],
    },
  ]) {
    await t.test("rejects a missing, duplicate, or external access domain", async () => {
      const result = await validateAccessPolicy(invalidCase.dotenv);

      assert.notEqual(result.exitCode, 0);
      for (const value of invalidCase.hiddenValues) {
        assert.doesNotMatch(result.output, new RegExp(value, "i"));
      }
    });
  }
});

test("waits for both private MCP services to become healthy", () => {
  assert.match(compose, /plane-mcp-http:[\s\S]*?healthcheck:[\s\S]*?socket\.create_connection/);
  assert.match(compose, /plane-mcp-gateway:[\s\S]*?condition: service_healthy[\s\S]*?healthcheck:[\s\S]*?\/healthz/);
  assert.match(deploy, /-f mcp\/compose\.yaml up -d --build --wait --wait-timeout 180/);
});

test("publishes only the OAuth gateway through Caddy", () => {
  assert.match(caddy, /\{\$MCP_DOMAIN:mcp\.example\.invalid\}/);
  assert.match(caddy, /reverse_proxy plane-mcp-gateway:8220/);
  assert.doesNotMatch(caddy, /reverse_proxy plane-mcp-http/);
});

test("validates and recreates Caddy after deploying mounted route changes", () => {
  const edgeUp = deploy.indexOf("-f compose.yaml up -d");
  const validate = deploy.indexOf("caddy validate --config /etc/caddy/Caddyfile");
  const recreate = deploy.indexOf("up -d --force-recreate --wait --wait-timeout 60 caddy");

  assert.ok(edgeUp >= 0);
  assert.ok(validate > edgeUp);
  assert.ok(recreate > validate);
  assert.doesNotMatch(deploy, /caddy reload/);
});

test("serves the status page only after the gateway signs the visitor in, from a read-only mount", async () => {
  const edge = await readFile(new URL("../compose.yaml", import.meta.url), "utf8");
  const mcp = await readFile(new URL("../mcp/compose.yaml", import.meta.url), "utf8");
  assert.match(caddy, /@statusFlow path \/status\/login \/status\/callback \/status\/logout/);
  assert.match(caddy, /handle @statusFlow \{\s*reverse_proxy plane-mcp-gateway:8220\s*\}/);
  assert.match(caddy, /@status path \/status \/status\//);
  // The file is only reachable inside the handler that first calls forward_auth, so a gateway failure cannot serve it.
  const block = (caddy.match(/handle @status \{[\s\S]*?\n  \}/)?.[0] ?? "").replace(/^\s*#.*$/gm, "");
  assert.match(block, /forward_auth plane-mcp-gateway:8220 \{\s*uri \/status-gate\/verify\s*\}/);
  assert.ok(block.indexOf("forward_auth") < block.indexOf("file_server"));
  assert.match(block, /Cache-Control "no-store"/);
  assert.match(block, /X-Robots-Tag "noindex"/);
  assert.match(mcp, /STATUS_PUBLIC_ORIGIN: https:\/\/\$\{PLANE_DOMAIN\}/);
  assert.match(caddy, /root \* \/srv\/status/);
  assert.match(caddy, /handle \{\s*reverse_proxy proxy:80\s*\}/);
  assert.match(edge, /\/opt\/hashpass\/status:\/srv\/status:ro/);
  // The runtime root is rsynced with --delete-delay, so the page must live outside it.
  assert.doesNotMatch(edge, /\.\/status:/);
});
