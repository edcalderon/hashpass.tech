import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import {createStatusGate} from "../src/status-gate.mjs";
import {nodeHeaders, sendResponse} from "../src/http-response.mjs";

const listen = (handler) =>
  new Promise((resolve) => {
    const server = http.createServer(async (incoming, outgoing) => {
      const request = new Request(new URL(incoming.url, "http://gateway.test"), {method: incoming.method, headers: incoming.headers});
      await sendResponse(await handler(request), outgoing);
    });
    server.listen(0, "127.0.0.1", () => resolve({server, port: server.address().port}));
  });

const get = (port, path) =>
  new Promise((resolve, reject) => {
    http.get({host: "127.0.0.1", port, path}, (res) => {
      res.resume();
      res.on("end", () => resolve(res));
    }).on("error", reject);
  });

test("repeated set-cookie headers each reach the client over real HTTP", async () => {
  const {server, port} = await listen(async () => {
    const headers = new Headers({location: "/status"});
    headers.append("set-cookie", "a=1; Path=/status");
    headers.append("set-cookie", "b=; Path=/status; Max-Age=0");
    return new Response(null, {status: 302, headers});
  });
  try {
    const res = await get(port, "/");
    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, "/status");
    assert.deepEqual(res.headers["set-cookie"], ["a=1; Path=/status", "b=; Path=/status; Max-Age=0"]);
  } finally {
    server.close();
  }
});

test("logout clears both the session and the sign-in flow cookie over real HTTP", async () => {
  const gate = createStatusGate({issuer: "https://auth.example.com/api/auth", resource: "https://mcp.example.com/mcp", sessionSecret: "s".repeat(32), keys: async () => { throw new Error("unused"); }, allowedEmailDomains: ["hashpass.tech"]});
  const {server, port} = await listen(gate);
  try {
    const res = await get(port, "/status/logout");
    const cookies = res.headers["set-cookie"] ?? [];
    assert.equal(cookies.length, 2);
    assert.ok(cookies.some((c) => c.startsWith("hp_status_session=;")));
    assert.ok(cookies.some((c) => c.startsWith("hp_status_flow=;")));
  } finally {
    server.close();
  }
});

test("other headers keep their values and a response without cookies sets none", () => {
  const out = nodeHeaders(new Response("x", {headers: {"cache-control": "no-store", "x-robots-tag": "noindex"}}));
  assert.deepEqual(out, {"cache-control": "no-store", "content-type": "text/plain;charset=UTF-8", "x-robots-tag": "noindex"});
});
