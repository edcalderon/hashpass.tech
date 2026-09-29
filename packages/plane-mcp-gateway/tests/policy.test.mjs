import test from "node:test";
import assert from "node:assert/strict";

import {
  authorizePlaneRequest,
  classifyPlaneAction,
} from "../src/policy.mjs";

const allowlist = {
  allowedSubjects: ["auth0|operator-123"],
  allowedEmails: ["operator@example.com"],
  allowedEmailDomains: ["hashpass.tech", "hashpass.app"],
};

function request(overrides = {}) {
  return {
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {name: "project", arguments: {action: "list"}},
    },
    scopes: ["plane:read"],
    subject: "auth0|operator-123",
    email: "operator@example.com",
    emailVerified: true,
    ...allowlist,
    ...overrides,
  };
}

test("classifies Plane read operations as read", () => {
  for (const action of [
    "list",
    "retrieve",
    "search",
    "count",
    "list_workitems",
    "download_url",
  ]) {
    assert.equal(classifyPlaneAction(action), "read", `${action} should be read-only`);
  }
});

test("classifies Plane mutation operations as write", () => {
  for (const action of [
    "create",
    "update",
    "delete",
    "archive",
    "unarchive",
    "add_member",
    "manage_label",
  ]) {
    assert.equal(classifyPlaneAction(action), "write", `${action} should be a mutation`);
  }
});

test("unknown and invalid actions fail closed instead of being treated as reads", () => {
  for (const action of ["execute_workflow", "", null, undefined, 42]) {
    assert.throws(
      () => classifyPlaneAction(action),
      /unknown|unsupported|invalid/i,
      `${String(action)} should be rejected`,
    );
  }
});

test("rejects a caller whose subject and email are not allowlisted", () => {
  const decision = authorizePlaneRequest(request({
    subject: "auth0|intruder",
    email: "intruder@example.com",
  }));

  assert.equal(decision.allowed, false);
});

test("accepts an allowlisted subject even when the email is not allowlisted", () => {
  const decision = authorizePlaneRequest(request({email: "other@example.com"}));

  assert.equal(decision.allowed, true);
});

test("accepts an allowlisted email even when the subject is not allowlisted", () => {
  const decision = authorizePlaneRequest(request({subject: "auth0|other"}));

  assert.equal(decision.allowed, true);
});

test("accepts verified users from approved Hashpass email domains", () => {
  for (const email of ["member@hashpass.tech", "EDWARD@HASHPASS.APP"]) {
    const decision = authorizePlaneRequest(request({
      subject: "auth0|domain-member",
      email,
      emailVerified: true,
    }));
    assert.equal(decision.allowed, true, `${email} should be authorized`);
  }
});

test("rejects unverified and look-alike Hashpass email domains", () => {
  for (const identity of [
    {email: "member@hashpass.tech", emailVerified: false},
    {email: "member@hashpass.app", emailVerified: undefined},
    {email: "member@hashpass.tech.evil.example", emailVerified: true},
    {email: "member@not-hashpass.app", emailVerified: true},
  ]) {
    const decision = authorizePlaneRequest(request({
      subject: "auth0|not-allowlisted",
      ...identity,
    }));
    assert.equal(decision.allowed, false, `${identity.email} should be rejected`);
  }
});

test("an empty allowlist rejects every caller", () => {
  const decision = authorizePlaneRequest(request({
    allowedSubjects: [],
    allowedEmails: [],
    allowedEmailDomains: [],
  }));

  assert.equal(decision.allowed, false);
});

test("read tools require plane:read", () => {
  const deniedWithoutScope = authorizePlaneRequest(request({scopes: []}));
  const deniedWithWriteOnly = authorizePlaneRequest(request({scopes: ["plane:write"]}));
  const allowed = authorizePlaneRequest(request({scopes: ["plane:read"]}));

  assert.equal(deniedWithoutScope.allowed, false);
  assert.equal(deniedWithWriteOnly.allowed, false);
  assert.equal(allowed.allowed, true);
});

test("write tools require plane:write", () => {
  const body = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {name: "workitem", arguments: {action: "create", name: "Triage OAuth"}},
  };

  const deniedWithReadOnly = authorizePlaneRequest(request({body, scopes: ["plane:read"]}));
  const allowed = authorizePlaneRequest(request({body, scopes: ["plane:write"]}));

  assert.equal(deniedWithReadOnly.allowed, false);
  assert.equal(allowed.allowed, true);
});

test("MCP initialize, tools/list, and ping require plane:read", () => {
  for (const method of ["initialize", "tools/list", "ping"]) {
    const body = {jsonrpc: "2.0", id: 1, method, params: {}};
    const denied = authorizePlaneRequest(request({body, scopes: []}));
    const allowed = authorizePlaneRequest(request({body, scopes: ["plane:read"]}));

    assert.equal(denied.allowed, false, `${method} must reject a caller without plane:read`);
    assert.equal(allowed.allowed, true, `${method} must accept an allowlisted plane:read caller`);
  }
});

test("malformed tools/call requests are rejected before action authorization", () => {
  const malformedBodies = [
    null,
    {},
    {jsonrpc: "2.0", id: 1},
    {jsonrpc: "2.0", id: 1, method: "tools/call"},
    {jsonrpc: "2.0", id: 1, method: "tools/call", params: {}},
    {jsonrpc: "2.0", id: 1, method: "tools/call", params: {name: ""}},
    {jsonrpc: "2.0", id: 1, method: "tools/call", params: {name: 123}},
  ];

  for (const body of malformedBodies) {
    const decision = authorizePlaneRequest(request({
      body,
      scopes: ["plane:read", "plane:write"],
    }));
    assert.equal(decision.allowed, false, `should reject ${JSON.stringify(body)}`);
  }
});

test("unknown MCP methods and unknown tool actions are rejected", () => {
  const unknownMethod = authorizePlaneRequest(request({
    body: {jsonrpc: "2.0", id: 1, method: "resources/list", params: {}},
    scopes: ["plane:read", "plane:write"],
  }));
  const unknownAction = authorizePlaneRequest(request({
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {name: "workitem", arguments: {action: "execute_workflow"}},
    },
    scopes: ["plane:read", "plane:write"],
  }));

  assert.equal(unknownMethod.allowed, false);
  assert.equal(unknownAction.allowed, false);
});
