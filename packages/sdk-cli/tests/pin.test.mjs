import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { FileSessionStore, FileStepUpProofStore, createSecretReader, runCli } from "../dist/index.js";

const future = (ms) => new Date(Date.now() + ms).toISOString();

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "hashpass-cli-pin-"));
  const env = {
    HASHPASS_APP_ID: "app_test",
    HASHPASS_BASE_URL: "https://api.example.test/api/",
    HASHPASS_SESSION_FILE: join(directory, "session.json"),
  };
  await new FileSessionStore(env.HASHPASS_SESSION_FILE).set({
    accessToken: "session-token",
    tokenType: "Bearer",
    expiresAt: "2099-01-01T00:00:00.000Z",
    scope: ["support"],
    user: { id: "user_1" },
  });
  return { env, proofFile: `${env.HASHPASS_SESSION_FILE}.step-up` };
}

function capture() {
  const out = [];
  const errors = [];
  return { out, errors, io: { out: (m) => out.push(m), error: (m) => errors.push(m) } };
}

const secrets = (...answers) => {
  const asked = [];
  const reader = async (question) => {
    asked.push(question);
    const next = answers.shift();
    if (next === undefined) throw new Error("unexpected prompt");
    return next;
  };
  return { reader, asked };
};

async function withFetch(replies, run) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : undefined, headers: new Headers(init.headers) });
    const reply = replies.shift();
    if (!reply) throw new Error(`unexpected fetch: ${url}`);
    return reply;
  };
  try {
    return { result: await run(), calls };
  } finally {
    globalThis.fetch = original;
  }
}

const status = (enabled) =>
  Response.json({ success: true, data: { status: "complete", pin: { enabled, lockedUntil: null, remainingAttempts: enabled ? 5 : null } } });
const verifyOk = (token = "proof.signature", expiresAt = future(60_000)) =>
  Response.json({ success: true, data: { ok: true, enabled: true, remainingAttempts: 5, lockedUntil: null, proof: { token, expiresAt } } });
const verifyWrong = (remainingAttempts, lockedUntil = null) =>
  Response.json({ success: true, data: { ok: false, enabled: true, remainingAttempts, lockedUntil } });
const setOk = () =>
  Response.json({ success: true, data: { ok: true, enabled: true, remainingAttempts: 5, lockedUntil: null } });

test("pin status reports whether a PIN exists, using the signed-in session", async () => {
  const { env } = await setup();
  const { out, io } = capture();
  const { calls } = await withFetch([status(true)], async () => {
    assert.equal(await runCli(["pin", "status"], env, io, { readSecret: secrets().reader }), 0);
  });
  assert.deepEqual(JSON.parse(out[0]), { enabled: true, lockedUntil: null, remainingAttempts: 5 });
  assert.equal(calls[0].url, "https://api.example.test/api/setup");
  assert.equal(calls[0].headers.get("authorization"), "Bearer session-token");
});

test("pin verify prints only the expiry and keeps the proof in a 0600 file, never in output", async () => {
  const { env, proofFile } = await setup();
  const { out, errors, io } = capture();
  const expiresAt = future(60_000);
  const { reader, asked } = secrets("1234");
  const { calls } = await withFetch([verifyOk("super.secret-proof", expiresAt)], async () => {
    assert.equal(await runCli(["pin", "verify"], env, io, { readSecret: reader }), 0);
  });

  assert.deepEqual(asked, ["PIN: "]);
  assert.deepEqual(calls[0].body, { action: "verify", pin: "1234", scope: "wallet:sign" });
  assert.deepEqual(JSON.parse(out[0]), { ok: true, scope: "wallet:sign", expiresAt });
  const everything = [...out, ...errors].join("\n");
  assert.ok(!everything.includes("super.secret-proof"), "the proof leaked into output");
  assert.ok(!everything.includes("1234"), "the PIN leaked into output");

  assert.equal((await stat(proofFile)).mode & 0o777, 0o600);
  const stored = await readFile(proofFile, "utf8");
  assert.ok(stored.includes("super.secret-proof"));
  assert.ok(!stored.includes("1234"), "the PIN reached disk");
  assert.equal((await new FileStepUpProofStore(proofFile).get("wallet:sign")).token, "super.secret-proof");
});

test("pin verify accepts --scope app:unlock and rejects unknown scopes before prompting", async () => {
  const { env } = await setup();
  const first = capture();
  const { calls } = await withFetch([verifyOk()], async () => {
    assert.equal(await runCli(["pin", "verify", "--scope", "app:unlock"], env, first.io, { readSecret: secrets("1234").reader }), 0);
  });
  assert.equal(calls[0].body.scope, "app:unlock");

  const second = capture();
  const { reader, asked } = secrets("1234");
  const { calls: none } = await withFetch([], async () => {
    assert.equal(await runCli(["pin", "verify", "--scope", "admin:everything"], env, second.io, { readSecret: reader }), 1);
  });
  assert.match(second.errors[0], /--scope must be/);
  assert.deepEqual(asked, []);
  assert.equal(none.length, 0);
});

test("a wrong PIN exits 1 with the attempts left and stores no proof", async () => {
  const { env, proofFile } = await setup();
  const { errors, io } = capture();
  await withFetch([verifyWrong(3)], async () => {
    assert.equal(await runCli(["pin", "verify"], env, io, { readSecret: secrets("0000").reader }), 1);
  });
  assert.equal(errors[0], "That PIN is not correct. 3 attempts left.");
  assert.ok(!errors.join("").includes("0000"));
  assert.equal(await new FileStepUpProofStore(proofFile).get("wallet:sign"), null);
});

test("a locked PIN says when to try again, and one attempt left is singular", async () => {
  const { env } = await setup();
  const lockedUntil = future(30_000);
  const locked = capture();
  await withFetch([verifyWrong(0, lockedUntil)], async () => {
    assert.equal(await runCli(["pin", "verify"], env, locked.io, { readSecret: secrets("0000").reader }), 1);
  });
  assert.equal(locked.errors[0], `Too many attempts. Try again after ${lockedUntil}.`);

  const last = capture();
  await withFetch([verifyWrong(1)], async () => {
    await runCli(["pin", "verify"], env, last.io, { readSecret: secrets("0000").reader });
  });
  assert.equal(last.errors[0], "That PIN is not correct. 1 attempt left.");
});

test("verifying with no PIN set points at `pin set` instead of claiming a wrong PIN", async () => {
  const { env } = await setup();
  const { errors, io } = capture();
  await withFetch([Response.json({ success: true, data: { ok: false, enabled: false, remainingAttempts: 0, lockedUntil: null } })], async () => {
    assert.equal(await runCli(["pin", "verify"], env, io, { readSecret: secrets("1234").reader }), 1);
  });
  assert.equal(errors[0], "No PIN is set. Run `hashpass pin set` first.");
});

test("refuses a PIN passed as a flag without prompting or calling the network", async () => {
  const { env } = await setup();
  for (const argv of [["pin", "verify", "--pin", "1234"], ["pin", "set", "--pin=1234"], ["pin", "set", "--current-pin", "1234"]]) {
    const { errors, io } = capture();
    const { reader, asked } = secrets("1234");
    const { calls } = await withFetch([], async () => {
      assert.equal(await runCli(argv, env, io, { readSecret: reader }), 1);
    });
    assert.match(errors[0], /Never pass a PIN as a flag/);
    assert.ok(!errors[0].includes("1234"));
    assert.deepEqual(asked, []);
    assert.equal(calls.length, 0);
  }
});

test("pin set creates a first PIN after confirming it, without asking for a current one", async () => {
  const { env } = await setup();
  const { out, io } = capture();
  const { reader, asked } = secrets("4321", "4321");
  const { calls } = await withFetch([status(false), setOk()], async () => {
    assert.equal(await runCli(["pin", "set"], env, io, { readSecret: reader }), 0);
  });
  assert.deepEqual(asked, ["New PIN: ", "Confirm new PIN: "]);
  assert.deepEqual(calls[1].body, { action: "set", pin: "4321" });
  assert.deepEqual(JSON.parse(out[0]), { ok: true, enabled: true });
});

test("pin set changes an existing PIN only with the current one", async () => {
  const { env } = await setup();
  const { io } = capture();
  const { reader, asked } = secrets("1111", "2222", "2222");
  const { calls } = await withFetch([status(true), setOk()], async () => {
    assert.equal(await runCli(["pin", "set"], env, io, { readSecret: reader }), 0);
  });
  assert.deepEqual(asked, ["Current PIN: ", "New PIN: ", "Confirm new PIN: "]);
  assert.deepEqual(calls[1].body, { action: "set", pin: "2222", currentPin: "1111" });
});

test("pin set stops on a mismatched confirmation before sending anything", async () => {
  const { env } = await setup();
  const { errors, io } = capture();
  const { calls } = await withFetch([status(false)], async () => {
    assert.equal(await runCli(["pin", "set"], env, io, { readSecret: secrets("4321", "4322").reader }), 1);
  });
  assert.equal(errors[0], "The PINs do not match.");
  assert.equal(calls.length, 1, "only the status read may reach the network");
});

test("pin set with a wrong current PIN reports the attempts left", async () => {
  const { env } = await setup();
  const { errors, io } = capture();
  await withFetch([status(true), verifyWrong(4)], async () => {
    assert.equal(await runCli(["pin", "set"], env, io, { readSecret: secrets("9999", "2222", "2222").reader }), 1);
  });
  assert.equal(errors[0], "That PIN is not correct. 4 attempts left.");
});

test("a non-numeric PIN is rejected locally, so it never counts as a guess", async () => {
  const { env } = await setup();
  const { errors, io } = capture();
  const { calls } = await withFetch([], async () => {
    assert.equal(await runCli(["pin", "verify"], env, io, { readSecret: secrets("12ab").reader }), 1);
  });
  assert.match(errors[0], /exactly four digits/);
  assert.equal(calls.length, 0);
});

test("pin forget removes one scope or all, and logout drops every proof", async () => {
  const { env, proofFile } = await setup();
  const store = new FileStepUpProofStore(proofFile);
  await store.set({ token: "a.b", scope: "wallet:sign", expiresAt: future(60_000) });
  await store.set({ token: "c.d", scope: "app:unlock", expiresAt: future(60_000) });

  assert.equal(await runCli(["pin", "forget", "--scope", "wallet:sign"], env, capture().io), 0);
  assert.equal(await store.get("wallet:sign"), null);
  assert.ok(await store.get("app:unlock"));

  assert.equal(await runCli(["pin", "forget"], env, capture().io), 0);
  assert.equal(await store.get("app:unlock"), null);

  await store.set({ token: "e.f", scope: "wallet:sign", expiresAt: future(60_000) });
  assert.equal(await runCli(["logout"], env, capture().io), 0);
  assert.equal(await store.get("wallet:sign"), null);

  const { errors, io } = capture();
  assert.equal(await runCli(["pin", "forget", "--scope", "nope"], env, io), 1);
  assert.match(errors[0], /--scope must be/);
});

test("an unknown pin subcommand is a handled error", async () => {
  const { env } = await setup();
  const { errors, io } = capture();
  assert.equal(await runCli(["pin", "frobnicate"], env, io, { readSecret: secrets().reader }), 1);
  assert.equal(errors[0], "Use `hashpass pin status|set|verify|forget`.");
});

test("the proof store ignores corrupt, foreign or mismatched entries instead of trusting them", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hashpass-cli-proofs-"));
  const path = join(directory, "proofs.json");
  const store = new FileStepUpProofStore(path);
  assert.equal(await store.get("wallet:sign"), null);

  await writeFile(path, "{not json");
  assert.equal(await store.get("wallet:sign"), null);

  await writeFile(path, JSON.stringify({
    "wallet:sign": { token: "x.y", scope: "app:unlock", expiresAt: future(60_000) },
    "app:unlock": { token: "", scope: "app:unlock", expiresAt: future(60_000) },
    "admin:all": { token: "x.y", scope: "admin:all", expiresAt: future(60_000) },
  }));
  assert.equal(await store.get("wallet:sign"), null, "a proof filed under the wrong scope must not be honoured");
  assert.equal(await store.get("app:unlock"), null);

  await writeFile(path, JSON.stringify([1, 2]));
  assert.equal(await store.get("wallet:sign"), null);
});

test("the secret reader takes one line per prompt from piped stdin and never echoes it to the output", async () => {
  const written = [];
  const prompts = { write: (chunk) => { written.push(String(chunk)); return true; } };
  const read = createSecretReader(Readable.from(["1234\n5678\r\n"]), prompts);
  assert.equal(await read("PIN: "), "1234");
  assert.equal(await read("Again: "), "5678");
  await assert.rejects(read("More: "), /No input/);
  assert.ok(!written.join("").includes("1234"));
  assert.ok(!written.join("").includes("5678"));
});

test("the secret reader fails clearly on empty input", async () => {
  const prompts = { write: () => true };
  await assert.rejects(createSecretReader(Readable.from([""]), prompts)("PIN: "), /No input/);
});

test("on a terminal the typed PIN is read with echo off", async () => {
  const { PassThrough } = await import("node:stream");
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => input;
  const written = [];
  const prompts = { write: (chunk) => { written.push(String(chunk)); return true; } };
  const pending = createSecretReader(input, prompts)("PIN: ");
  input.write("4321\n");
  assert.equal(await pending, "4321");
  assert.ok(written.join("").startsWith("PIN: "));
  assert.ok(!written.join("").includes("4321"), "the typed PIN was echoed");
});
