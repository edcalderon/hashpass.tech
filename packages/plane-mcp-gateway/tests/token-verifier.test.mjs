import test from "node:test";
import assert from "node:assert/strict";

import {identityFromPayload} from "../src/token-verifier.mjs";

test("extracts namespaced verified email claims for gateway policy", () => {
  assert.deepEqual(identityFromPayload({
    sub: "better-auth-user-1",
    scope: "plane:read plane:write",
    "https://hashpass.tech/email": "member@hashpass.tech",
    "https://hashpass.tech/email_verified": true,
  }), {
    subject: "better-auth-user-1",
    email: "member@hashpass.tech",
    emailVerified: true,
    scopes: ["plane:read", "plane:write"],
  });
});

test("fails email verification closed for missing or non-boolean claims", () => {
  for (const value of [undefined, "true", 1, null]) {
    const identity = identityFromPayload({
      sub: "better-auth-user-1",
      "https://hashpass.tech/email": "member@hashpass.tech",
      "https://hashpass.tech/email_verified": value,
    });
    assert.equal(identity.emailVerified, false);
  }
});
