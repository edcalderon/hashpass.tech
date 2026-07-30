import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "../dist/args.js";
import { FileSessionStore } from "../dist/session-store.js";

test("parses commands, positionals, and flags", () => {
  assert.deepEqual(parseArgs(["support", "reply", "ticket_1", "--message", "hello", "--json"]), {
    command: "support",
    positionals: ["reply", "ticket_1"],
    flags: { message: "hello", json: true },
  });
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
