import http from "node:http";
import {createGatewayHandler} from "./gateway.mjs";
import {createTokenVerifier} from "./token-verifier.mjs";
import {createPlanePages} from "./plane-pages.mjs";
import {createStatusGate} from "./status-gate.mjs";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const csv = (name) => (process.env[name] || "").split(",").map((value) => value.trim()).filter(Boolean);
const resource = process.env.MCP_RESOURCE_URL?.trim() || "https://mcp.hashpass.tech/mcp";
const issuer = process.env.MCP_OAUTH_ISSUER?.trim() || "https://api.hashpass.tech/api/auth";
const port = Number.parseInt(process.env.PORT || "8220", 10);

// Optional: a dedicated Plane account that lets the gateway serve the `page` tool (see plane-pages.mjs).
const pageEmail = process.env.PLANE_PAGES_EMAIL?.trim();
const pagePassword = process.env.PLANE_PAGES_PASSWORD;
const planePages = pageEmail && pagePassword
  ? createPlanePages({
      baseUrl: required("PLANE_BASE_URL"),
      workspaceSlug: required("PLANE_WORKSPACE_SLUG"),
      email: pageEmail,
      password: pagePassword,
    })
  : null;

const handler = createGatewayHandler({
  planePages,
  resource,
  authorizationServers: [issuer],
  scopesSupported: ["openid", "profile", "email", "offline_access", "plane:read", "plane:write"],
  upstreamUrl: process.env.PLANE_MCP_UPSTREAM_URL?.trim() || "http://plane-mcp-http:8211/http/api-key/mcp",
  serviceToken: required("PLANE_API_KEY"),
  workspaceSlug: required("PLANE_WORKSPACE_SLUG"),
  allowedSubjects: csv("MCP_ALLOWED_SUBJECTS"),
  allowedEmails: csv("MCP_ALLOWED_EMAILS"),
  allowedEmailDomains: csv("MCP_ALLOWED_EMAIL_DOMAINS"),
  verifyRequest: createTokenVerifier({
    issuer,
    audience: resource,
    jwksUrl: process.env.MCP_OAUTH_JWKS_URL?.trim() || `${issuer}/jwks`,
  }),
});

// Sign-in gate for work.hashpass.tech/status: same issuer, JWKS and email allowlist as the MCP resource above.
const statusGate = createStatusGate({
  publicOrigin: process.env.STATUS_PUBLIC_ORIGIN?.trim() || `https://${process.env.PLANE_DOMAIN?.trim() || "work.hashpass.tech"}`,
  issuer,
  resource,
  clientId: process.env.STATUS_OAUTH_CLIENT_ID?.trim() || undefined,
  sessionSecret: process.env.STATUS_SESSION_SECRET?.trim() || undefined,
  serviceSecret: required("PLANE_API_KEY"),
  jwksUrl: process.env.MCP_OAUTH_JWKS_URL?.trim() || `${issuer}/jwks`,
  allowedSubjects: csv("MCP_ALLOWED_SUBJECTS"),
  allowedEmails: csv("MCP_ALLOWED_EMAILS"),
  allowedEmailDomains: csv("MCP_ALLOWED_EMAIL_DOMAINS"),
});

const server = http.createServer(async (incoming, outgoing) => {
  try {
    const origin = `http://${incoming.headers.host || "127.0.0.1"}`;
    const body = incoming.method === "GET" || incoming.method === "HEAD" ? undefined : incoming;
    const request = new Request(new URL(incoming.url || "/", origin), {
      method: incoming.method,
      headers: incoming.headers,
      body,
      duplex: body ? "half" : undefined,
    });
    const response = (await statusGate(request)) ?? (await handler(request));
    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    if (!response.body) return outgoing.end();
    for await (const chunk of response.body) outgoing.write(chunk);
    outgoing.end();
  } catch {
    outgoing.writeHead(500, {"content-type": "text/plain", "cache-control": "no-store"});
    outgoing.end("Internal Server Error\n");
  }
});

server.requestTimeout = 60_000;
server.headersTimeout = 15_000;
server.listen(port, "0.0.0.0", () => process.stderr.write(`Hashpass Plane MCP gateway listening on :${port}\n`));
