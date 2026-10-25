import assert from "node:assert/strict";
import test from "node:test";
import { redirectPassShare } from "./pass-share";

test("public pass short links redirect only opaque tokens to HashPass", async () => {
  const token = "A".repeat(43);
  const response = await redirectPassShare(new Request("https://hpass.id/p/" + token), token);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), `https://hashpass.tech/public-pass/${token}`);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
});

test("public pass short links reject identifiers that are too short", async () => {
  const response = await redirectPassShare(new Request("https://hpass.id/p/pass-1"), "pass-1");
  assert.equal(response.status, 404);
});
