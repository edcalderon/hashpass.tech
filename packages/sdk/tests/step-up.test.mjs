import assert from "node:assert/strict";
import test from "node:test";
import {
  HashpassError,
  MemoryStepUpProofStore,
  StepUpDeniedError,
  createHashpass,
  isProofUsable,
} from "../dist/index.js";
import { StepUpClient as AuthSubpathStepUpClient } from "../dist/auth/index.js";

const future = (ms) => new Date(Date.now() + ms).toISOString();

// Records each request and answers from a queue, so a test can assert both what
// was sent and how many times (a PIN guess must never be sent twice by accident).
function scriptedFetch(...replies) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : undefined });
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    return reply ?? Response.json({ success: false }, { status: 500 });
  };
  return { fetch, calls };
}

const client = (fetch, extra = {}) =>
  createHashpass({
    appId: "app_test",
    baseUrl: "https://api.example.test/api/",
    fetch,
    auth: { getAccessToken: async () => "session-token" },
    retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 },
    ...extra,
  });

const verifyOk = (token = "proof.signature", expiresAt = future(60_000)) =>
  Response.json({ success: true, data: { ok: true, enabled: true, remainingAttempts: 5, lockedUntil: null, proof: { token, expiresAt } } });

const verifyWrong = (remainingAttempts = 4, lockedUntil = null) =>
  Response.json({ success: true, data: { ok: false, enabled: true, remainingAttempts, lockedUntil } });

test("exposes the step-up client on the SDK and from the ./auth entry point", () => {
  const sdk = client(scriptedFetch().fetch);
  assert.ok(sdk.stepUp instanceof AuthSubpathStepUpClient);
});

test("reads PIN status through the setup endpoint with the bearer session", async () => {
  const { fetch, calls } = scriptedFetch(
    Response.json({ success: true, data: { status: "complete", pin: { enabled: true, lockedUntil: null, remainingAttempts: 5 } } }),
  );
  const status = await client(fetch).stepUp.getPinStatus();
  assert.deepEqual(status, { enabled: true, lockedUntil: null, remainingAttempts: 5 });
  assert.equal(calls[0].url, "https://api.example.test/api/setup");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(new Headers(calls[0].init.headers).get("authorization"), "Bearer session-token");
});

test("creates a PIN and sends the current PIN only when changing it", async () => {
  const outcome = { ok: true, enabled: true, remainingAttempts: 5, lockedUntil: null };
  const { fetch, calls } = scriptedFetch(
    Response.json({ success: true, data: outcome }),
    Response.json({ success: true, data: outcome }),
  );
  const sdk = client(fetch);
  assert.deepEqual(await sdk.stepUp.setPin("1234"), outcome);
  await sdk.stepUp.setPin("5678", "1234");
  assert.equal(calls[0].url, "https://api.example.test/api/setup/pin");
  assert.deepEqual(calls[0].body, { action: "set", pin: "1234" });
  assert.deepEqual(calls[1].body, { action: "set", pin: "5678", currentPin: "1234" });
});

test("rejects anything that is not exactly four digits before touching the network", async () => {
  const { fetch, calls } = scriptedFetch();
  const sdk = client(fetch);
  for (const bad of ["123", "12345", "12a4", "", " 123", "１２３４", 1234, null, undefined]) {
    await assert.rejects(sdk.stepUp.verify(bad, "wallet:sign"), (error) => error instanceof HashpassError && error.code === "validation_error");
    await assert.rejects(sdk.stepUp.setPin(bad), (error) => error.code === "validation_error");
  }
  await assert.rejects(sdk.stepUp.setPin("1234", "12"), (error) => error.code === "validation_error");
  assert.equal(calls.length, 0);
});

test("a correct PIN returns a scoped proof and remembers it", async () => {
  const { fetch, calls } = scriptedFetch(verifyOk("abc.def"));
  const sdk = client(fetch);
  const result = await sdk.stepUp.verify("1234", "wallet:sign");
  assert.equal(result.ok, true);
  assert.equal(result.proof.token, "abc.def");
  assert.equal(result.proof.scope, "wallet:sign");
  assert.deepEqual(calls[0].body, { action: "verify", pin: "1234", scope: "wallet:sign" });
  assert.equal((await sdk.stepUp.getProof("wallet:sign")).token, "abc.def");
  // A proof for one scope never satisfies another.
  assert.equal(await sdk.stepUp.getProof("app:unlock"), null);
});

test("a wrong PIN is an answer, not an exception, and stores no proof", async () => {
  const { fetch } = scriptedFetch(verifyWrong(3));
  const sdk = client(fetch);
  const result = await sdk.stepUp.verify("0000", "wallet:sign");
  assert.deepEqual(result, { ok: false, enabled: true, remainingAttempts: 3, lockedUntil: null });
  assert.equal(await sdk.stepUp.getProof("wallet:sign"), null);
});

test("never retries a PIN guess, even when the network or server fails", async () => {
  for (const reply of [new TypeError("socket hang up"), Response.json({ success: false }, { status: 503 })]) {
    const { fetch, calls } = scriptedFetch(reply, verifyOk(), verifyOk());
    await assert.rejects(client(fetch).stepUp.verify("1234", "wallet:sign"));
    assert.equal(calls.length, 1, "a guess was replayed behind the caller's back");
  }
  const { fetch, calls } = scriptedFetch(new TypeError("boom"), Response.json({ success: true, data: {} }));
  await assert.rejects(client(fetch).stepUp.setPin("1234"));
  assert.equal(calls.length, 1);
});

test("treats a malformed success response as an error rather than a pass", async () => {
  for (const body of [{ success: true }, { success: false }, { success: true, data: { ok: true, enabled: true, remainingAttempts: 5, lockedUntil: null } }]) {
    const { fetch } = scriptedFetch(Response.json(body));
    const sdk = client(fetch);
    const outcome = await sdk.stepUp.verify("1234", "wallet:sign").catch((error) => error);
    // The third body claims ok but carries no proof: it must not mint one.
    assert.ok(outcome instanceof HashpassError || outcome.ok === false, JSON.stringify(body));
    assert.equal(await sdk.stepUp.getProof("wallet:sign"), null);
  }
});

test("require() reuses a valid proof without asking again", async () => {
  const { fetch, calls } = scriptedFetch(verifyOk("first.proof"));
  const sdk = client(fetch);
  let prompts = 0;
  const prompt = async () => { prompts += 1; return "1234"; };
  const first = await sdk.stepUp.require("wallet:sign", prompt);
  const second = await sdk.stepUp.require("wallet:sign", prompt);
  assert.equal(first.token, "first.proof");
  assert.equal(second.token, "first.proof");
  assert.equal(prompts, 1);
  assert.equal(calls.length, 1);
});

test("require() prompts again once the proof is within the expiry margin, and drops it", async () => {
  const store = new MemoryStepUpProofStore();
  await store.set({ token: "stale.proof", scope: "wallet:sign", expiresAt: future(2_000) });
  const { fetch, calls } = scriptedFetch(verifyOk("fresh.proof"));
  const sdk = client(fetch, { stepUpStore: store });
  const proof = await sdk.stepUp.require("wallet:sign", async () => "1234");
  assert.equal(proof.token, "fresh.proof");
  assert.equal(calls.length, 1);
});

test("require() throws StepUpDeniedError with the outcome for a wrong or locked PIN", async () => {
  const wrong = await client(scriptedFetch(verifyWrong(2)).fetch).stepUp
    .require("wallet:sign", async () => "0000").catch((error) => error);
  assert.ok(wrong instanceof StepUpDeniedError);
  assert.equal(wrong.outcome.remainingAttempts, 2);
  assert.match(wrong.message, /not correct/i);

  const lockedUntil = future(30_000);
  const locked = await client(scriptedFetch(verifyWrong(0, lockedUntil)).fetch).stepUp
    .require("wallet:sign", async () => "0000").catch((error) => error);
  assert.ok(locked instanceof StepUpDeniedError);
  assert.equal(locked.outcome.lockedUntil, lockedUntil);
  assert.match(locked.message, /too many attempts/i);
  // The message never echoes the PIN.
  assert.ok(!JSON.stringify(locked.outcome).includes("0000"));
});

test("clear() forgets one scope or all of them", async () => {
  const { fetch } = scriptedFetch(verifyOk("a.b"), verifyOk("c.d"));
  const sdk = client(fetch);
  await sdk.stepUp.verify("1234", "wallet:sign");
  await sdk.stepUp.verify("1234", "app:unlock");
  await sdk.stepUp.clear("wallet:sign");
  assert.equal(await sdk.stepUp.getProof("wallet:sign"), null);
  assert.ok(await sdk.stepUp.getProof("app:unlock"));
  await sdk.stepUp.clear();
  assert.equal(await sdk.stepUp.getProof("app:unlock"), null);
});

test("a host-supplied proof store is used and never receives the PIN", async () => {
  const written = [];
  const store = {
    get: () => null,
    set: (proof) => { written.push(proof); },
    clear: () => {},
  };
  const { fetch } = scriptedFetch(verifyOk("persisted.proof"));
  await client(fetch, { stepUpStore: store }).stepUp.verify("4321", "wallet:sign");
  assert.equal(written.length, 1);
  assert.deepEqual(Object.keys(written[0]).sort(), ["expiresAt", "scope", "token"]);
  assert.ok(!JSON.stringify(written).includes("4321"));
});

test("a registered second factor takes over without changing the proof format", async () => {
  const { fetch, calls } = scriptedFetch();
  const sdk = client(fetch);
  const seen = [];
  sdk.stepUp.registerMethod({
    id: "device-locker",
    verify: async (credential, scope) => {
      seen.push([credential, scope]);
      return { ok: true, proof: { token: "locker.proof", scope, expiresAt: future(60_000) } };
    },
  });
  const proof = await sdk.stepUp.require("wallet:sign", async () => ({ lease: "abc" }), "device-locker");
  assert.equal(proof.token, "locker.proof");
  assert.deepEqual(seen, [[{ lease: "abc" }, "wallet:sign"]]);
  assert.equal(calls.length, 0);
});

test("an unknown second factor is a configuration error", async () => {
  const sdk = client(scriptedFetch().fetch);
  await assert.rejects(
    sdk.stepUp.verify("1234", "wallet:sign", "retina-scan"),
    (error) => error instanceof HashpassError && error.code === "configuration_error",
  );
});

test("isProofUsable refuses missing, expired and nearly-expired proofs", () => {
  const now = Date.parse("2030-01-01T00:00:00.000Z");
  const proof = (offsetMs) => ({ token: "t", scope: "wallet:sign", expiresAt: new Date(now + offsetMs).toISOString() });
  assert.equal(isProofUsable(null, now), false);
  assert.equal(isProofUsable(undefined, now), false);
  assert.equal(isProofUsable(proof(-1), now), false);
  assert.equal(isProofUsable(proof(4_999), now), false);
  assert.equal(isProofUsable(proof(5_001), now), true);
  assert.equal(isProofUsable({ token: "t", scope: "wallet:sign", expiresAt: "garbage" }, now), false);
});
