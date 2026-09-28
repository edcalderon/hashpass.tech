import test from "node:test";
import assert from "node:assert/strict";

import {createGatewayHandler} from "../src/gateway.mjs";

const gatewayUrl = "https://plane-mcp.example.com";
const metadataUrl = `${gatewayUrl}/.well-known/oauth-protected-resource/mcp`;
const resourceUrl = `${gatewayUrl}/mcp`;
const authorizationServer = "https://auth.example.com/application/o/hashpass/";

function createOptions(overrides = {}) {
  return {
    resource: resourceUrl,
    authorizationServers: [authorizationServer],
    scopesSupported: ["plane:read", "plane:write"],
    upstreamUrl: "https://plane.example.com/mcp",
    serviceToken: "plane-service-secret",
    workspaceSlug: "hashpass",
    allowedSubjects: ["auth0|operator-123"],
    allowedEmails: ["operator@example.com"],
    verifyRequest: async () => ({
      subject: "auth0|operator-123",
      email: "operator@example.com",
      scopes: ["plane:read"],
    }),
    fetch: async () => Response.json({jsonrpc: "2.0", id: 1, result: {}}),
    ...overrides,
  };
}

test("serves exact OAuth protected-resource metadata", async () => {
  const handler = createGatewayHandler(createOptions());

  const response = await handler(new Request(metadataUrl));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    resource: resourceUrl,
    authorization_servers: [authorizationServer],
    scopes_supported: ["plane:read", "plane:write"],
  });
});

test("also serves root protected-resource metadata for legacy clients", async () => {
  const handler = createGatewayHandler(createOptions());
  const response = await handler(new Request(`${gatewayUrl}/.well-known/oauth-protected-resource`));

  assert.equal(response.status, 200);
  assert.equal((await response.json()).resource, resourceUrl);
});

test("answers MCP preflight requests with CORS headers", async () => {
  const handler = createGatewayHandler(createOptions());
  const response = await handler(new Request(resourceUrl, {
    method: "OPTIONS",
    headers: {
      Origin: "https://chatgpt.com",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization, content-type",
    },
  }));

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.match(response.headers.get("access-control-allow-methods") ?? "", /POST/i);
  assert.match(response.headers.get("access-control-allow-headers") ?? "", /authorization/i);
  assert.match(response.headers.get("access-control-allow-headers") ?? "", /content-type/i);
});

test("returns an OAuth resource challenge for an unauthenticated MCP request", async () => {
  const handler = createGatewayHandler(createOptions({
    verifyRequest: async () => null,
  }));
  const response = await handler(new Request(resourceUrl, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({jsonrpc: "2.0", id: 1, method: "ping"}),
  }));

  assert.equal(response.status, 401);
  assert.equal(
    response.headers.get("www-authenticate"),
    `Bearer resource_metadata="${metadataUrl}"`,
  );
});

test("forwards an authorized JSON-RPC request using only the Plane service credential", async () => {
  const rawBody = '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"project","arguments":{"action":"list"}}}';
  let upstreamCall;
  const handler = createGatewayHandler(createOptions({
    fetch: async (url, init) => {
      upstreamCall = {url: String(url), init};
      return Response.json({jsonrpc: "2.0", id: 7, result: {projects: []}}, {status: 200});
    },
  }));

  const response = await handler(new Request(resourceUrl, {
    method: "POST",
    headers: {
      authorization: "Bearer end-user-oauth-token",
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": "2025-06-18",
      "mcp-session-id": "mcp-session-7",
    },
    body: rawBody,
  }));

  assert.equal(response.status, 200);
  assert.equal(upstreamCall.url, "https://plane.example.com/mcp");
  assert.equal(upstreamCall.init.method, "POST");
  assert.equal(upstreamCall.init.body, rawBody);

  const forwardedHeaders = new Headers(upstreamCall.init.headers);
  assert.equal(forwardedHeaders.get("authorization"), "Bearer plane-service-secret");
  assert.equal(forwardedHeaders.get("x-workspace-slug"), "hashpass");
  assert.equal(forwardedHeaders.get("accept"), "application/json, text/event-stream");
  assert.equal(forwardedHeaders.get("mcp-protocol-version"), "2025-06-18");
  assert.equal(forwardedHeaders.get("mcp-session-id"), "mcp-session-7");
  assert.notEqual(forwardedHeaders.get("authorization"), "Bearer end-user-oauth-token");

  assert.deepEqual(await response.json(), {
    jsonrpc: "2.0",
    id: 7,
    result: {projects: []},
  });
});

test("returns 403 on policy denial without contacting Plane", async () => {
  let upstreamCalls = 0;
  const handler = createGatewayHandler(createOptions({
    fetch: async () => {
      upstreamCalls += 1;
      return Response.json({});
    },
  }));
  const response = await handler(new Request(resourceUrl, {
    method: "POST",
    headers: {
      authorization: "Bearer valid-read-only-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: {name: "workitem", arguments: {action: "create", name: "Must not forward"}},
    }),
  }));

  assert.equal(response.status, 403);
  assert.equal(upstreamCalls, 0);
});

test("rejects a declared oversized body before token verification", async () => {
  let verificationCalls = 0;
  const handler = createGatewayHandler(createOptions({
    maxBodyBytes: 8,
    verifyRequest: async () => {
      verificationCalls += 1;
      return null;
    },
  }));

  const response = await handler(new Request(resourceUrl, {
    method: "POST",
    headers: {"content-length": "9", "content-type": "application/json"},
    body: "123456789",
  }));

  assert.equal(response.status, 413);
  assert.equal(verificationCalls, 0);
});

test("stops reading a streamed body as soon as it exceeds the limit", async () => {
  let cancelled = false;
  let upstreamCalls = 0;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("1234"));
      controller.enqueue(new TextEncoder().encode("56789"));
    },
    cancel() {
      cancelled = true;
    },
  });
  const handler = createGatewayHandler(createOptions({
    maxBodyBytes: 8,
    fetch: async () => {
      upstreamCalls += 1;
      return Response.json({});
    },
  }));

  const response = await handler(new Request(resourceUrl, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body,
    duplex: "half",
  }));

  assert.equal(response.status, 413);
  assert.equal(cancelled, true);
  assert.equal(upstreamCalls, 0);
});
