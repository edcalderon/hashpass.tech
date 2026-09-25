import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "../dist/args.js";
import { FileSessionStore } from "../dist/session-store.js";
import { runCli } from "../dist/cli.js";

function makeIo() {
  const out = [];
  const err = [];
  return { io: { out: (m) => out.push(m), error: (m) => err.push(m) }, out, err };
}

test("parses commands, positionals, and flags", () => {
  assert.deepEqual(parseArgs(["support", "reply", "ticket_1", "--message", "hello", "--json"]), {
    command: "support",
    positionals: ["reply", "ticket_1"],
    flags: { message: "hello", json: true },
  });
});

test("support doctor works without HASHPASS_APP_ID (no-network command)", async () => {
  const { io, out } = makeIo();
  const exitCode = await runCli(["support", "doctor", "--json"], {}, io);
  assert.equal(exitCode, 0);
  const printed = JSON.parse(out.join(""));
  assert.equal(printed.ok, true);
  assert.ok(Array.isArray(printed.checks));
});

test("support widget init works without HASHPASS_APP_ID (no-network command)", async () => {
  const { io, out } = makeIo();
  const exitCode = await runCli(["support", "widget", "init", "--json"], {}, io);
  assert.equal(exitCode, 0);
  const printed = JSON.parse(out.join(""));
  assert.ok(printed.element.includes("<hashpass-support"));
  assert.ok(printed.script.startsWith("https://"));
});

test("support widget show still requires HASHPASS_APP_ID (real network command)", async () => {
  const { io, err } = makeIo();
  const exitCode = await runCli(["support", "widget", "show"], {}, io);
  assert.equal(exitCode, 1);
  assert.match(err.join(""), /HASHPASS_APP_ID/);
});

test("stores CLI sessions with user-only permissions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hashpass-cli-"));
  const path = join(directory, "nested", "session.json");
  const store = new FileSessionStore(path);
  const session = {
    accessToken: "secret",
    tokenType: "Bearer",
    expiresAt: "2099-01-01T00:00:00.000Z",
    scope: ["support"],
  };
  await store.set(session);
  assert.deepEqual(await store.get(), session);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.ok((await readFile(path, "utf8")).endsWith("\n"));
  await store.clear();
  assert.equal(await store.get(), null);
});
