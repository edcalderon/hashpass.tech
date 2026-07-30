import assert from "node:assert/strict";
import test from "node:test";
import { HashpassError, createHashpass } from "../dist/index.js";

test("requires a public app id", () => {
  assert.throws(() => createHashpass({ appId: "" }), (error) => {
    assert.equal(error.code, "configuration_error");
    return true;
  });
});

test("creates an AI-assisted support ticket with app and auth headers", async () => {
  let captured;
  const fetch = async (url, init) => {
    captured = { url, init };
    return Response.json({ id: "ticket_1", subject: "Help", status: "open", priority: "normal" });
  };
  const sdk = createHashpass({
    appId: "app_test",
    baseUrl: "https://support.example.test/api/",
    fetch,
    auth: { getAccessToken: () => "access-token" },
  });
  await sdk.support.createTicket({ subject: "Help", message: "Something broke", idempotencyKey: "once" });

  assert.equal(captured.url, "https://support.example.test/api/v1/support/tickets");
  assert.equal(captured.init.headers.get("x-hashpass-app-id"), "app_test");
  assert.equal(captured.init.headers.get("authorization"), "Bearer access-token");
  assert.equal(captured.init.headers.get("idempotency-key"), "once");
  assert.deepEqual(JSON.parse(captured.init.body), {
    aiAssistance: true,
    subject: "Help",
    message: "Something broke",
  });
});

test("returns typed API errors with request correlation", async () => {
  const sdk = createHashpass({
    appId: "app_test",
    fetch: async () => Response.json(
      { message: "Ticket missing", details: { ticketId: "nope" } },
      { status: 404, headers: { "x-request-id": "req_123" } },
    ),
  });
  await assert.rejects(sdk.support.getTicket("nope"), (error) => {
    assert.ok(error instanceof HashpassError);
    assert.equal(error.code, "not_found");
    assert.equal(error.requestId, "req_123");
    return true;
  });
});

test("session-backed auth refreshes an expired token", async () => {
  let session = {
    accessToken: "expired",
    refreshToken: "refresh",
    tokenType: "Bearer",
    expiresAt: "2000-01-01T00:00:00.000Z",
    scope: ["support"],
  };
  const sdk = createHashpass({
    appId: "app_test",
    sessionStore: { get: () => session, set: (next) => { session = next; }, clear: () => { session = null; } },
    fetch: async () => Response.json({
      accessToken: "fresh",
      refreshToken: "refresh-2",
      tokenType: "Bearer",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: ["support"],
    }),
  });
  assert.equal(await sdk.auth.getAccessToken(), "fresh");
  assert.equal(session.refreshToken, "refresh-2");
});
