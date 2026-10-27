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

test("accepts standard OIDC email claims advertised by the authorization server", () => {
  assert.deepEqual(identityFromPayload({
    sub: "better-auth-user-2",
    scope: "plane:read",
    email: "member@hashpass.tech",
    email_verified: true,
  }), {
    subject: "better-auth-user-2",
    email: "member@hashpass.tech",
    emailVerified: true,
    scopes: ["plane:read"],
  });
});

test("keeps namespaced email claims authoritative over standard OIDC fallbacks", () => {
  const identity = identityFromPayload({
    email: "member@hashpass.tech",
    email_verified: true,
    "https://hashpass.tech/email": "member@hashpass.app",
    "https://hashpass.tech/email_verified": false,
  });

  assert.equal(identity.email, "member@hashpass.app");
  assert.equal(identity.emailVerified, false);
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
