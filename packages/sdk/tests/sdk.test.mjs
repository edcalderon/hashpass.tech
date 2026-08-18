import assert from "node:assert/strict";
import test from "node:test";
import { HashpassError, createHashpass } from "../dist/index.js";

test("binds the default globalThis.fetch so it survives being invoked as a method on another object", async () => {
  // Regression test: every other test in this file passes its own `fetch`
  // mock explicitly, which is a plain function with no receiver
  // requirement -- none of them exercised the *default* path
  // (`options.fetch ?? globalThis.fetch`) that every real app actually
  // uses. Real browsers' native fetch is a Web IDL operation that requires
  // its receiver to be `window`; every SDK transport stores fetch on a
  // private #options field and calls it as `this.#options.fetch(...)`,
  // which is a *different* receiver. Real symptom hit in production:
  // "TypeError: Failed to execute 'fetch' on 'Window': Illegal
  // invocation" -- silently caught as a generic network_error, with zero
  // network activity, easy to mistake for a config/CORS problem instead of
  // what it actually was.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = function fakeNativeFetch() {
    if (this !== globalThis) {
      throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    }
    return Response.json({ id: "ticket_1", subject: "s", status: "open", priority: "normal" });
  };
  try {
    const sdk = createHashpass({ appId: "app_test" }); // no explicit fetch -- exercises the default path
    const ticket = await sdk.support.getTicket("ticket_1");
    assert.equal(ticket.id, "ticket_1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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

test("preserves caller cancellation instead of reporting a timeout", async () => {
  const controller = new AbortController();
  let fetchStarted;
  const fetchReady = new Promise((resolve) => { fetchStarted = resolve; });
  const sdk = createHashpass({
    appId: "app_test",
    fetch: async (_url, init) => {
      fetchStarted();
      await new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      });
    },
    timeoutMs: 5_000,
  });

  const request = sdk.support.watchTicket("ticket_1", { signal: controller.signal }).next();
  await fetchReady;
  controller.abort(new Error("caller stopped watching"));
  await assert.rejects(request, (error) => {
    assert.equal(error.message, "caller stopped watching");
    assert.notEqual(error.code, "timeout");
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

test("authQr requires linksApiBaseUrl before it can be used", async () => {
  const sdk = createHashpass({ appId: "app_test", fetch: async () => Response.json({}) });
  await assert.rejects(sdk.authQr.beginLogin(), (error) => {
    assert.ok(error instanceof HashpassError);
    assert.equal(error.code, "configuration_error");
    return true;
  });
});

test("authQr.beginLogin creates a PKCE challenge and returns the binding secret", async () => {
  let captured;
  const fetch = async (url, init) => {
    captured = { url, init };
    return Response.json(
      { id: "chal_1", qrUrl: "https://hashpass.link/auth/chal_1", expiresAt: "2099-01-01T00:00:00.000Z", state: "state_1", binding: "binding_1" },
      { status: 201 },
    );
  };
  const sdk = createHashpass({ appId: "app_test", fetch, linksApiBaseUrl: "https://links.example.test/" });

  const result = await sdk.authQr.beginLogin();

  assert.equal(captured.url, "https://links.example.test/api/v1/auth/qr/challenges");
  assert.equal(captured.init.headers.get("x-hashpass-app-id"), "app_test");
  assert.equal(captured.init.headers.has("authorization"), false);
  const body = JSON.parse(captured.init.body);
  assert.equal(body.codeChallenge.length > 0, true);
  assert.equal(result.challenge.id, "chal_1");
  assert.equal(result.challenge.binding, undefined, "binding is not part of the QR-safe challenge payload");
  assert.equal(result.codeVerifier.length > 0, true);
  assert.equal(result.binding, "binding_1");
});

test("authQr.waitForLogin sends the binding secret as a header, not a cookie, and exchanges for a session", async () => {
  const captured = [];
  const responses = [
    () => Response.json({ status: "pending", expiresAt: "2099-01-01T00:00:00.000Z" }),
    () => Response.json({ status: "approved", expiresAt: "2099-01-01T00:00:00.000Z", authorizationCode: "code_1" }),
    () => Response.json({ status: "consumed", userId: "user_1", session: { accessToken: "access_1", refreshToken: "refresh_1" } }),
  ];
  const fetch = async (url, init) => {
    captured.push({ url, init });
    return responses.shift()();
  };
  const sdk = createHashpass({ appId: "app_test", fetch, linksApiBaseUrl: "https://links.example.test/" });

  const session = await sdk.authQr.waitForLogin(
    { challenge: { id: "chal_1", qrUrl: "u", expiresAt: "e", state: "state_1" }, codeVerifier: "verifier_1", binding: "binding_1" },
    { pollIntervalMs: 0 },
  );

  assert.deepEqual(session, { userId: "user_1", accessToken: "access_1", refreshToken: "refresh_1" });
  assert.equal(responses.length, 0);
  for (const { init } of captured) {
    assert.equal(init.headers.get("x-hashpass-binding"), "binding_1");
    assert.equal(init.credentials, undefined, "no longer relies on cookies at all");
  }
});

test("authQr.waitForLogin rejects when the login is denied", async () => {
  const fetch = async () => Response.json({ status: "denied", expiresAt: "2099-01-01T00:00:00.000Z" });
  const sdk = createHashpass({ appId: "app_test", fetch, linksApiBaseUrl: "https://links.example.test/" });

  await assert.rejects(
    sdk.authQr.waitForLogin({ challenge: { id: "c", qrUrl: "u", expiresAt: "e", state: "s" }, codeVerifier: "v", binding: "b" }),
    (error) => {
      assert.equal(error.code, "unauthorized");
      return true;
    },
  );
});

test("authQr.respondToLogin sends the app's own bearer token, not the browser-binding header", async () => {
  let captured;
  const fetch = async (url, init) => {
    captured = { url, init };
    return Response.json({ status: "approved" });
  };
  const sdk = createHashpass({
    appId: "app_test",
    fetch,
    linksApiBaseUrl: "https://links.example.test/",
    auth: { getAccessToken: () => "mobile-session-token" },
  });

  const result = await sdk.authQr.respondToLogin("chal_1", "approve");

  assert.equal(captured.url, "https://links.example.test/api/v1/auth/qr/challenges/chal_1/approve");
  assert.equal(captured.init.headers.get("authorization"), "Bearer mobile-session-token");
  assert.equal(captured.init.headers.has("x-hashpass-binding"), false);
  assert.deepEqual(JSON.parse(captured.init.body), { decision: "approve" });
  assert.equal(result.status, "approved");
});

test("authQr.respondToLogin sends an idempotency key derived from the challenge and decision, so a retried POST is safe", async () => {
  let captured;
  const fetch = async (url, init) => {
    captured = { url, init };
    return Response.json({ status: "approved" });
  };
  const sdk = createHashpass({
    appId: "app_test",
    fetch,
    linksApiBaseUrl: "https://links.example.test/",
    auth: { getAccessToken: () => "mobile-session-token" },
  });

  await sdk.authQr.respondToLogin("chal_1", "approve");

  assert.equal(captured.init.headers.get("idempotency-key"), "chal_1:approve");
});

test("authQr.waitForLogin absorbs a sustained run of gateway-level 503s (surviving HttpTransport's own internal retries) instead of surfacing a hard error for a transient blip", async () => {
  let callCount = 0;
  const fetch = async () => {
    callCount += 1;
    // The first poll cycle's underlying GET is retried 3x internally by
    // HttpTransport before this pollLogin() call finally rejects -- all
    // three of those attempts 503 here, simulating a real gateway-level
    // blip (confirmed live: fast, clean 503s with no matching Lambda-side
    // error). The second poll cycle gets a real "denied" response --
    // proving waitForLogin polled again after the transient run rather
    // than giving up on it.
    if (callCount <= 3) return new Response(JSON.stringify({ message: "Service Unavailable" }), { status: 503 });
    return Response.json({ status: "denied", expiresAt: "2099-01-01T00:00:00.000Z" });
  };
  const sdk = createHashpass({ appId: "app_test", fetch, linksApiBaseUrl: "https://links.example.test/" });

  await assert.rejects(
    sdk.authQr.waitForLogin(
      { challenge: { id: "chal_1", qrUrl: "u", expiresAt: "e", state: "state_1" }, codeVerifier: "v", binding: "b" },
      { pollIntervalMs: 0 },
    ),
    (error) => {
      // 'unauthorized' (denied) only happens if the poll loop got PAST the
      // transient 503 run to a real subsequent response, not 'api_error' /
      // 'network_error' from giving up on the blip itself.
      assert.equal(error.code, "unauthorized");
      return true;
    },
  );
  assert.equal(callCount, 4, "3 failed attempts on the first poll cycle, then 1 successful poll");
});

test("authQr.waitForLogin eventually gives up after too many consecutive failed poll cycles", async () => {
  const fetch = async () => new Response(JSON.stringify({ message: "Service Unavailable" }), { status: 503 });
  const sdk = createHashpass({ appId: "app_test", fetch, linksApiBaseUrl: "https://links.example.test/" });

  await assert.rejects(
    sdk.authQr.waitForLogin(
      { challenge: { id: "chal_1", qrUrl: "u", expiresAt: "e", state: "state_1" }, codeVerifier: "v", binding: "b" },
      { pollIntervalMs: 0 },
    ),
    (error) => {
      assert.equal(error.code, "api_error");
      return true;
    },
  );
});
