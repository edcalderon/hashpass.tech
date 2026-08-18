import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../dist/index.js";

function io() {
  const out = [];
  const errors = [];
  return { out, errors, io: { out: (m) => out.push(m), error: (m) => errors.push(m) } };
}

async function baseEnv(extra = {}) {
  const directory = await mkdtemp(join(tmpdir(), "hashpass-cli-dispatch-"));
  return {
    HASHPASS_APP_ID: "app_test",
    HASHPASS_SESSION_FILE: join(directory, "session.json"),
    ...extra,
  };
}

async function withFetch(fetchImpl, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("no command prints help and exits 0 without touching the network", async () => {
  const { out, io: capture } = io();
  const code = await runCli([], await baseEnv(), capture);
  assert.equal(code, 0);
  assert.ok(out[0].startsWith("Hashpass CLI"));
});

test("--help flag prints help even alongside an otherwise-valid command", async () => {
  const { out, io: capture } = io();
  const code = await runCli(["support", "--help"], await baseEnv(), capture);
  assert.equal(code, 0);
  assert.ok(out[0].startsWith("Hashpass CLI"));
});

test("missing app id fails fast with a clear message, before any SDK call", async () => {
  const { errors, io: capture } = io();
  const code = await runCli(["whoami"], await baseEnv({ HASHPASS_APP_ID: undefined }), capture);
  assert.equal(code, 1);
  assert.equal(errors[0], "Set HASHPASS_APP_ID or pass --app-id <public-app-id>.");
});

test("login drives the device-code flow and prints the verification URL and code before completing", async () => {
  const { out, io: capture } = io();
  const fetch = async (url) => {
    if (String(url).includes("v1/auth/device/authorize")) {
      return Response.json({
        deviceCode: "device_1",
        userCode: "ABCD-EFGH",
        verificationUri: "https://hashpass.tech/device",
        verificationUriComplete: "https://hashpass.tech/device?code=ABCD-EFGH",
        expiresIn: 600,
        interval: 0,
      });
    }
    if (String(url).includes("v1/auth/device/token")) {
      return Response.json({
        accessToken: "access_1",
        refreshToken: "refresh_1",
        tokenType: "Bearer",
        expiresAt: "2099-01-01T00:00:00.000Z",
        scope: ["support"],
        user: { id: "user_1", email: "person@example.test" },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  const env = await baseEnv();
  const code = await withFetch(fetch, () => runCli(["login"], env, capture));

  assert.equal(code, 0);
  assert.equal(out[0], "Open https://hashpass.tech/device?code=ABCD-EFGH");
  assert.equal(out[1], "Code: ABCD-EFGH");
  const result = JSON.parse(out[2]);
  assert.deepEqual(result, { authenticated: true, user: { id: "user_1", email: "person@example.test" }, expiresAt: "2099-01-01T00:00:00.000Z" });
});

test("whoami reports not-logged-in as a handled error, not a crash", async () => {
  const { errors, io: capture } = io();
  const code = await runCli(["whoami"], await baseEnv(), capture);
  assert.equal(code, 1);
  assert.equal(errors[0], "Not logged in. Run `hashpass login` first.");
});

test("whoami reads the persisted session without making a network call", async () => {
  const env = await baseEnv();
  const { FileSessionStore } = await import("../dist/index.js");
  await new FileSessionStore(env.HASHPASS_SESSION_FILE).set({
    accessToken: "access_1",
    tokenType: "Bearer",
    expiresAt: "2099-01-01T00:00:00.000Z",
    scope: ["support"],
    user: { id: "user_1" },
  });
  const { out, io: capture } = io();
  const code = await withFetch(() => { throw new Error("whoami must not call fetch for a fresh, unexpired session"); }, () => runCli(["whoami"], env, capture));

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(out[0]), { user: { id: "user_1" }, scopes: ["support"], expiresAt: "2099-01-01T00:00:00.000Z" });
});

test("logout clears the session without calling the API when there is nothing to revoke", async () => {
  const { out, io: capture } = io();
  const env = await baseEnv();
  const code = await withFetch(() => { throw new Error("logout must not call fetch when there is no refresh token to revoke"); }, () => runCli(["logout"], env, capture));

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(out[0]), { authenticated: false });
});

test("support create requires --subject", async () => {
  const { errors, io: capture } = io();
  const code = await runCli(["support", "create", "--message", "hi"], await baseEnv(), capture);
  assert.equal(code, 1);
  assert.equal(errors[0], "--subject is required.");
});

test("support create sends platform: cli as ticket context", async () => {
  let captured;
  const fetch = async (url, init) => {
    captured = { url, init };
    return Response.json({ id: "ticket_1", subject: "Help", status: "open", priority: "normal" }, { status: 201 });
  };
  const { out, io: capture } = io();
  const env = await baseEnv();
  const code = await withFetch(fetch, () => runCli(
    ["support", "create", "--subject", "Help", "--message", "Something broke"],
    env,
    capture,
  ));

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(captured.init.body), {
    aiAssistance: true,
    subject: "Help",
    message: "Something broke",
    context: { platform: "cli" },
  });
  assert.deepEqual(JSON.parse(out[0]), { id: "ticket_1", subject: "Help", status: "open", priority: "normal" });
});

test("support show requires a ticket id", async () => {
  const { errors, io: capture } = io();
  const code = await runCli(["support", "show"], await baseEnv(), capture);
  assert.equal(code, 1);
  assert.equal(errors[0], "A ticket ID is required for support show.");
});

test("unknown top-level command is a handled error, not a crash", async () => {
  const { errors, io: capture } = io();
  const code = await runCli(["frobnicate"], await baseEnv(), capture);
  assert.equal(code, 1);
  assert.equal(errors[0], "Unknown command: frobnicate. Run `hashpass help`.");
});

test("a typed HashpassError from the API is formatted with its code and request id, not a raw stack trace", async () => {
  const fetch = async () => Response.json(
    { message: "Ticket missing" },
    { status: 404, headers: { "x-request-id": "req_123" } },
  );
  const { errors, io: capture } = io();
  const env = await baseEnv();
  const code = await withFetch(fetch, () => runCli(["support", "show", "ticket_1"], env, capture));

  assert.equal(code, 1);
  assert.equal(errors[0], "Hashpass error [not_found] (req_123): Ticket missing");
});
