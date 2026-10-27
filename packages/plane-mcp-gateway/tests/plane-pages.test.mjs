import test from "node:test";
import assert from "node:assert/strict";

import {createGatewayHandler} from "../src/gateway.mjs";
import {createPlanePages, PlanePageError} from "../src/plane-pages.mjs";

const PROJECT = "8c6755ef-6d32-4076-9173-a6b06db7fc40";
const PAGE = "11111111-2222-3333-4444-555555555555";
const BASE = "https://plane.example.com";

/** A stand-in for Plane's sign-in, CSRF and page routes that records every request. */
function fakePlane({signInWorks = true, expireSessionOnce = false} = {}) {
  const calls = [];
  let sessions = 0;
  let expire = expireSessionOnce;
  const fetch = async (url, init = {}) => {
    const {pathname} = new URL(url);
    calls.push({method: init.method ?? "GET", pathname, headers: init.headers ?? {}, body: init.body});
    if (pathname === "/auth/get-csrf-token/") {
      return new Response(JSON.stringify({csrf_token: "csrf-1"}), {headers: {"set-cookie": "csrftoken=csrf-1; Path=/; Secure"}});
    }
    if (pathname === "/auth/sign-in/") {
      const headers = new Headers({location: signInWorks ? "/" : "/?error_code=5000"});
      if (signInWorks) {
        sessions += 1;
        headers.append("set-cookie", `session-id=session-${sessions}; Path=/; HttpOnly; Secure`);
      }
      return new Response(null, {status: 302, headers});
    }
    if (expire) {
      expire = false;
      return new Response(JSON.stringify({detail: "Authentication credentials were not provided."}), {status: 401});
    }
    if (!(init.headers?.cookie ?? "").includes("session-id=")) return new Response("{}", {status: 401});
    if (init.method === "DELETE" && pathname.endsWith(`${PAGE}/`)) return new Response(null, {status: 204});
    return new Response(JSON.stringify({id: PAGE, name: "Echo", pathname}), {status: init.method === "POST" ? 201 : 200});
  };
  return {fetch, calls, signIns: () => sessions};
}

const client = (plane, extra = {}) =>
  createPlanePages({baseUrl: BASE, workspaceSlug: "plane", email: "pages@example.com", password: "s3cret", fetch: plane.fetch, ...extra});

test("signs in once with the CSRF token and reuses the session", async () => {
  const plane = fakePlane();
  const pages = client(plane);

  await pages.run({action: "list", project_id: PROJECT});
  await pages.run({action: "list", project_id: PROJECT});

  assert.equal(plane.signIns(), 1);
  const signIn = plane.calls.find((c) => c.pathname === "/auth/sign-in/");
  assert.equal(signIn.headers["x-csrftoken"], "csrf-1");
  const form = new URLSearchParams(signIn.body);
  assert.equal(form.get("email"), "pages@example.com");
  assert.equal(form.get("csrfmiddlewaretoken"), "csrf-1");
});

test("creates a page on the project route with the CSRF header and session cookie", async () => {
  const plane = fakePlane();
  const result = await client(plane).run({action: "create", project_id: PROJECT, name: "Mission Command Center", description_html: "<h1>Hi</h1>", access: 0});

  assert.equal(result.id, PAGE);
  const create = plane.calls.find((c) => c.method === "POST" && c.pathname.includes("/pages/"));
  assert.equal(create.pathname, `/api/workspaces/plane/projects/${PROJECT}/pages/`);
  assert.equal(create.headers["x-csrftoken"], "csrf-1");
  assert.match(create.headers.cookie, /session-id=session-1/);
  assert.deepEqual(JSON.parse(create.body), {name: "Mission Command Center", description_html: "<h1>Hi</h1>", access: 0});
});

test("maps retrieve, update, archive, unarchive and delete onto Plane's routes", async () => {
  const plane = fakePlane();
  const pages = client(plane);
  await pages.run({action: "retrieve", project_id: PROJECT, page_id: PAGE});
  await pages.run({action: "update", project_id: PROJECT, page_id: PAGE, name: "New"});
  await pages.run({action: "archive", project_id: PROJECT, page_id: PAGE});
  await pages.run({action: "archive", project_id: PROJECT, page_id: PAGE, archive: false});
  await pages.run({action: "delete", project_id: PROJECT, page_id: PAGE});

  const seen = plane.calls.filter((c) => c.pathname.includes("/pages/")).map((c) => `${c.method} ${c.pathname.split(`${PROJECT}/`)[1]}`);
  assert.deepEqual(seen, [
    `GET pages/${PAGE}/`,
    `PATCH pages/${PAGE}/`,
    `POST pages/${PAGE}/archive/`,
    `DELETE pages/${PAGE}/archive/`,
    `DELETE pages/${PAGE}/`,
  ]);
});

test("signs in again when Plane rejects an expired session", async () => {
  const plane = fakePlane({expireSessionOnce: true});
  const result = await client(plane).run({action: "list", project_id: PROJECT});

  assert.equal(result.id, PAGE);
  assert.equal(plane.signIns(), 2);
});

test("fails closed when sign-in does not produce a session", async () => {
  const plane = fakePlane({signInWorks: false});
  await assert.rejects(() => client(plane).run({action: "list", project_id: PROJECT}), /sign-in for the page service account failed/);
});

test("rejects unsupported actions, missing project and malformed ids before any request", async () => {
  const plane = fakePlane();
  const pages = client(plane);
  await assert.rejects(() => pages.run({action: "set_collection", project_id: PROJECT}), PlanePageError);
  await assert.rejects(() => pages.run({action: "list"}), /project_id/);
  await assert.rejects(() => pages.run({action: "retrieve", project_id: PROJECT, page_id: "../../etc"}), /UUID/);
  await assert.rejects(() => pages.run({action: "retrieve", project_id: "x/../y", page_id: PAGE}), /UUID/);
  await assert.rejects(() => pages.run({action: "update", project_id: PROJECT, page_id: PAGE}), /name, description_html/);
  assert.equal(plane.calls.length, 0);
});

test("refuses a workspace slug that could rewrite the request path", () => {
  assert.throws(() => createPlanePages({baseUrl: BASE, workspaceSlug: "../admin", email: "a@b.c", password: "x"}), /slug/);
});

const gatewayOptions = (plane, overrides = {}) => ({
  resource: "https://mcp.example.com/mcp",
  authorizationServers: ["https://auth.example.com"],
  scopesSupported: ["plane:read", "plane:write"],
  upstreamUrl: "https://upstream.example.com/mcp",
  serviceToken: "service-secret",
  workspaceSlug: "plane",
  allowedEmails: ["operator@example.com"],
  verifyRequest: async () => ({subject: "s", email: "operator@example.com", emailVerified: true, scopes: ["plane:read", "plane:write"]}),
  planePages: client(plane),
  ...overrides,
});

const toolCall = (args, name = "page") =>
  new Request("https://mcp.example.com/mcp", {
    method: "POST",
    headers: {"content-type": "application/json", authorization: "Bearer t"},
    body: JSON.stringify({jsonrpc: "2.0", id: 7, method: "tools/call", params: {name, arguments: args}}),
  });

test("gateway answers page tool calls itself and never forwards them to the legacy upstream", async () => {
  const plane = fakePlane();
  let upstreamHit = false;
  const handler = createGatewayHandler(gatewayOptions(plane, {fetch: async () => { upstreamHit = true; return Response.json({}); }}));

  const response = await handler(toolCall({action: "create", project_id: PROJECT, name: "MC", description_html: "<p>x</p>"}));
  const payload = await response.json();

  assert.equal(upstreamHit, false);
  assert.equal(payload.id, 7);
  assert.equal(payload.result.isError, false);
  assert.equal(JSON.parse(payload.result.content[0].text).result.id, PAGE);
});

test("gateway still enforces the write scope on page creation", async () => {
  const plane = fakePlane();
  const handler = createGatewayHandler(gatewayOptions(plane, {
    verifyRequest: async () => ({subject: "s", email: "operator@example.com", emailVerified: true, scopes: ["plane:read"]}),
  }));

  const response = await handler(toolCall({action: "create", project_id: PROJECT, name: "MC"}));

  assert.equal(response.status, 403);
  assert.equal(plane.calls.length, 0);
});

test("gateway reports a page failure as a tool error without leaking credentials", async () => {
  const plane = fakePlane({signInWorks: false});
  const handler = createGatewayHandler(gatewayOptions(plane));

  const response = await handler(toolCall({action: "list", project_id: PROJECT}));
  const payload = await response.json();

  assert.equal(payload.result.isError, true);
  assert.doesNotMatch(JSON.stringify(payload), /s3cret|session-id|csrf/);
});

test("non-page tools are still forwarded upstream with the service credential", async () => {
  const plane = fakePlane();
  let seen;
  const handler = createGatewayHandler(gatewayOptions(plane, {fetch: async (url, init) => { seen = {url, auth: init.headers.get("authorization")}; return Response.json({jsonrpc: "2.0", id: 7, result: {}}); }}));

  await handler(toolCall({action: "list", project_id: PROJECT}, "module"));

  assert.equal(seen.url, "https://upstream.example.com/mcp");
  assert.equal(seen.auth, "Bearer service-secret");
});

test("without a page account configured, page calls keep going upstream", async () => {
  const plane = fakePlane();
  let upstreamHit = false;
  const handler = createGatewayHandler(gatewayOptions(plane, {planePages: null, fetch: async () => { upstreamHit = true; return Response.json({}); }}));

  await handler(toolCall({action: "list", project_id: PROJECT}));

  assert.equal(upstreamHit, true);
});
