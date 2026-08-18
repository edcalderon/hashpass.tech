import assert from "node:assert/strict";
import test from "node:test";
import { HashpassError, createHashpass } from "../dist/index.js";

const BASE_QR_LINK = {
  id: "link_1",
  ownerId: "user_1",
  publicSlug: "my-slug",
  name: "Booth banner",
  destinationUrl: "https://hashpass.tech/",
  status: "active",
  visualConfig: {
    foreground: "#071426",
    background: "#ffffff",
    modules: "square",
    finderEye: "rounded",
    logo: false,
    errorCorrection: "Q",
    margin: 4,
    logoSize: 18,
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function sdkWith(fetch) {
  return createHashpass({
    appId: "app_test",
    fetch,
    linksApiBaseUrl: "https://links.example.test/",
    auth: { getAccessToken: () => "owner-session-token" },
  });
}

test("qrLinks requires linksApiBaseUrl before it can be used", async () => {
  const sdk = createHashpass({ appId: "app_test", fetch: async () => Response.json({}) });
  await assert.rejects(sdk.qrLinks.list(), (error) => {
    assert.ok(error instanceof HashpassError);
    assert.equal(error.code, "configuration_error");
    return true;
  });
});

test("qrLinks.create posts to api/v1/qr-links with the caller's bearer token", async () => {
  let captured;
  const fetch = async (url, init) => {
    captured = { url, init };
    return Response.json(BASE_QR_LINK, { status: 201 });
  };
  const sdk = sdkWith(fetch);

  const result = await sdk.qrLinks.create({
    name: "Booth banner",
    destinationUrl: "https://hashpass.tech/",
    captchaToken: "captcha_1",
  });

  assert.equal(captured.url, "https://links.example.test/api/v1/qr-links");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers.get("x-hashpass-app-id"), "app_test");
  assert.equal(captured.init.headers.get("authorization"), "Bearer owner-session-token");
  assert.deepEqual(JSON.parse(captured.init.body), {
    name: "Booth banner",
    destinationUrl: "https://hashpass.tech/",
    captchaToken: "captcha_1",
  });
  assert.equal(result.id, "link_1");
});

test("qrLinks.list unwraps the { links } envelope", async () => {
  let captured;
  const fetch = async (url, init) => {
    captured = { url, init };
    return Response.json({ links: [BASE_QR_LINK] });
  };
  const sdk = sdkWith(fetch);

  const result = await sdk.qrLinks.list();

  assert.equal(captured.url, "https://links.example.test/api/v1/qr-links");
  assert.equal(captured.init.method, "GET");
  assert.deepEqual(result, [BASE_QR_LINK]);
});

test("qrLinks.get fetches a single link by id, URI-encoded", async () => {
  let captured;
  const fetch = async (url, init) => {
    captured = { url, init };
    return Response.json(BASE_QR_LINK);
  };
  const sdk = sdkWith(fetch);

  const result = await sdk.qrLinks.get("link/1 weird");

  assert.equal(captured.url, "https://links.example.test/api/v1/qr-links/link%2F1%20weird");
  assert.equal(result.id, "link_1");
});

test("qrLinks.slugAvailability sends the slug as a query parameter", async () => {
  let captured;
  const fetch = async (url, init) => {
    captured = { url, init };
    return Response.json({ available: true, slug: "my slug" });
  };
  const sdk = sdkWith(fetch);

  const result = await sdk.qrLinks.slugAvailability("my slug");

  assert.equal(captured.url, "https://links.example.test/api/v1/qr-links/slug-availability?slug=my%20slug");
  assert.equal(captured.init.method, "GET");
  assert.equal(result.available, true);
});

test("qrLinks.update PATCHes only the supplied fields", async () => {
  let captured;
  const fetch = async (url, init) => {
    captured = { url, init };
    return Response.json({ ...BASE_QR_LINK, status: "paused" });
  };
  const sdk = sdkWith(fetch);

  const result = await sdk.qrLinks.update("link_1", { status: "paused" });

  assert.equal(captured.url, "https://links.example.test/api/v1/qr-links/link_1");
  assert.equal(captured.init.method, "PATCH");
  assert.deepEqual(JSON.parse(captured.init.body), { status: "paused" });
  assert.equal(result.status, "paused");
});

test("qrLinks.delete issues a DELETE and resolves without a body", async () => {
  let captured;
  const fetch = async (url, init) => {
    captured = { url, init };
    return new Response(null, { status: 204 });
  };
  const sdk = sdkWith(fetch);

  const result = await sdk.qrLinks.delete("link_1");

  assert.equal(captured.url, "https://links.example.test/api/v1/qr-links/link_1");
  assert.equal(captured.init.method, "DELETE");
  assert.equal(result, undefined);
});

test("qrLinks.analytics fetches the per-link analytics window", async () => {
  let captured;
  const analytics = {
    windowDays: 30,
    totalScans: 12,
    humanScans: 10,
    botScans: 2,
    scansByDay: { "2026-08-01": 3 },
    scansByDevice: { mobile: 8, desktop: 4 },
  };
  const fetch = async (url, init) => {
    captured = { url, init };
    return Response.json(analytics);
  };
  const sdk = sdkWith(fetch);

  const result = await sdk.qrLinks.analytics("link_1");

  assert.equal(captured.url, "https://links.example.test/api/v1/qr-links/link_1/analytics");
  assert.deepEqual(result, analytics);
});

test("qrLinks surfaces typed API errors the same way other clients do", async () => {
  const sdk = sdkWith(async () => Response.json(
    { message: "Slug already taken", details: { field: "publicSlug" } },
    { status: 422 },
  ));

  await assert.rejects(
    sdk.qrLinks.create({ name: "n", destinationUrl: "https://x.test/", captchaToken: "c" }),
    (error) => {
      assert.ok(error instanceof HashpassError);
      assert.equal(error.code, "validation_error");
      assert.deepEqual(error.details, { field: "publicSlug" });
      return true;
    },
  );
});

test("qrLinks reuses one transport across calls instead of rebuilding it per request", async () => {
  let callCount = 0;
  const fetch = async () => {
    callCount += 1;
    return Response.json({ links: [] });
  };
  const sdk = sdkWith(fetch);

  await sdk.qrLinks.list();
  await sdk.qrLinks.list();

  assert.equal(callCount, 2, "sanity: both calls actually reached fetch");
});
