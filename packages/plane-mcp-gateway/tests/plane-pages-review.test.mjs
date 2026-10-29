import test from "node:test";
import assert from "node:assert/strict";

import {createPlanePages, PlanePageError} from "../src/plane-pages.mjs";

const PROJECT = "8c6755ef-6d32-4076-9173-a6b06db7fc40";
const PAGE = "11111111-2222-3333-4444-555555555555";
const PARENT = "22222222-3333-4444-5555-666666666666";

function fakePlane() {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    calls.push({
      method: init.method ?? "GET",
      pathname: parsed.pathname,
      body: init.body,
      headers: init.headers ?? {},
    });

    if (parsed.pathname === "/auth/get-csrf-token/") {
      return new Response(JSON.stringify({csrf_token: "csrf-1"}), {
        headers: {"set-cookie": "csrftoken=csrf-1; Path=/"},
      });
    }
    if (parsed.pathname === "/auth/sign-in/") {
      return new Response(null, {
        status: 302,
        headers: {"set-cookie": "session-id=session-1; Path=/"},
      });
    }
    if ((init.method ?? "GET") === "GET" && parsed.pathname.endsWith("/description/")) {
      return new Response(null, {status: 404});
    }
    return new Response(JSON.stringify({id: PAGE, name: "Updated"}), {status: 200});
  };
  return {calls, fetch};
}

function createClient(plane) {
  return createPlanePages({
    baseUrl: "https://plane.test",
    workspaceSlug: "acme",
    email: "tester@example.com",
    password: "secret",
    fetch: plane.fetch,
  });
}

test("updates description_html through Plane's description endpoint with all required representations", async () => {
  const plane = fakePlane();
  const pages = createClient(plane);

  await pages.run({
    action: "update",
    project_id: PROJECT,
    page_id: PAGE,
    description_html: "<p>Updated description</p>",
  });

  const descriptionPath = `/api/workspaces/acme/projects/${PROJECT}/pages/${PAGE}/description/`;
  const descriptionCalls = plane.calls.filter((call) => call.pathname === descriptionPath && call.method === "PATCH");
  assert.equal(descriptionCalls.length, 1);
  assert.equal(descriptionCalls[0].method, "PATCH");

  const body = JSON.parse(descriptionCalls[0].body);
  assert.equal(body.description_html, "<p>Updated description</p>");
  assert.equal(typeof body.description_binary, "string");
  assert.notEqual(body.description_binary.length, 0);
  assert.match(body.description_binary, /^[A-Za-z0-9+/]+={0,2}$/);
  assert.ok(Buffer.from(body.description_binary, "base64").length > 0);
  assert.equal(typeof body.description_json, "object");
  assert.notEqual(body.description_json, null);
  assert.equal(Array.isArray(body.description_json), false);

  const ordinaryPagePath = `/api/workspaces/acme/projects/${PROJECT}/pages/${PAGE}`;
  assert.equal(
    plane.calls.some((call) => call.method === "PATCH" && call.pathname.replace(/\/$/, "") === ordinaryPagePath),
    false,
  );
});

test("rejects nested page creation with parent_id before making an HTTP request", async () => {
  const plane = fakePlane();
  const pages = createClient(plane);

  await assert.rejects(
    pages.run({
      action: "create",
      project_id: PROJECT,
      name: "Nested page",
      description_html: "<p>Child</p>",
      parent_id: PARENT,
    }),
    (error) => {
      assert.ok(error instanceof PlanePageError);
      assert.match(error.message, /parent_id/i);
      assert.match(error.message, /(nested|unsupported|not supported|remove)/i);
      return true;
    },
  );

  assert.equal(plane.calls.length, 0);
});
