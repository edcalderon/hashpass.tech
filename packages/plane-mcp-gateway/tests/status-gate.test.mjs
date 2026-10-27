import test from "node:test";
import assert from "node:assert/strict";
import {exportJWK, generateKeyPair, SignJWT} from "jose";

import {createStatusGate} from "../src/status-gate.mjs";

const ISSUER = "https://auth.example.com/api/auth";
const RESOURCE = "https://mcp.example.com/mcp";
const ORIGIN = "https://work.example.com";

const {publicKey, privateKey} = await generateKeyPair("EdDSA", {extractable: true});

const accessToken = (claims = {}, overrides = {}) =>
  new SignJWT({scope: "openid email", email: "ana@hashpass.tech", email_verified: true, ...claims})
    .setProtectedHeader({alg: "EdDSA"})
    .setSubject("user-1")
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? RESOURCE)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

function authServer({token, registerOk = true, tokenOk = true} = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const {pathname} = new URL(url);
    calls.push({pathname, body: init.body});
    if (pathname.endsWith("/oauth2/register")) {
      return registerOk ? Response.json({client_id: "client-1"}) : new Response("{}", {status: 400});
    }
    if (pathname.endsWith("/oauth2/token")) {
      return tokenOk ? Response.json({access_token: await token()}) : new Response("{}", {status: 400});
    }
    return new Response("{}", {status: 404});
  };
  return {fetch, calls};
}

const gate = (server, extra = {}) =>
  createStatusGate({
    publicOrigin: ORIGIN,
    issuer: ISSUER,
    resource: RESOURCE,
    serviceSecret: "service-secret",
    keys: async () => publicKey,
    allowedEmailDomains: ["hashpass.app", "hashpass.tech"],
    fetch: server.fetch,
    ...extra,
  });

const get = (handle, path, cookies = "") =>
  handle(new Request(`${ORIGIN}${path}`, {headers: cookies ? {cookie: cookies} : {}}));
const cookiesOf = (response) =>
  response.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !c.endsWith("=")).join("; ");

/** Runs login and callback with the given token and returns the callback response. */
async function signIn(handle, {state} = {}) {
  const login = await get(handle, "/status/login");
  const authorize = new URL(login.headers.get("location"));
  const callback = await get(
    handle,
    `/status/callback?code=abc&state=${state ?? authorize.searchParams.get("state")}`,
    cookiesOf(login),
  );
  return {login, authorize, callback};
}

test("an unauthenticated visitor is sent to sign in and never gets the page", async () => {
  const handle = gate(authServer());
  const response = await get(handle, "/status-gate/verify");
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/status/login");
});

test("a forged or tampered session cookie is rejected", async () => {
  const handle = gate(authServer());
  const forged = await get(handle, "/status-gate/verify", "hp_status_session=eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.");
  assert.equal(forged.status, 302);
});

test("login starts an authorization-code flow with PKCE and the MCP resource", async () => {
  const server = authServer();
  const {login, authorize} = await signIn(gate(server));

  assert.equal(login.status, 302);
  assert.equal(authorize.origin + authorize.pathname, `${ISSUER}/oauth2/authorize`);
  assert.equal(authorize.searchParams.get("client_id"), "client-1");
  assert.equal(authorize.searchParams.get("redirect_uri"), `${ORIGIN}/status/callback`);
  assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
  assert.ok(authorize.searchParams.get("code_challenge"));
  assert.equal(authorize.searchParams.get("resource"), RESOURCE);
  assert.match(login.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Lax/);
});

test("an approved domain gets a session that unlocks the page", async () => {
  const server = authServer({token: () => accessToken()});
  const handle = gate(server);
  const {callback} = await signIn(handle);

  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get("location"), "/status");
  const session = cookiesOf(callback);
  assert.match(session, /hp_status_session=/);
  assert.equal((await get(handle, "/status-gate/verify", session)).status, 200);

  const exchange = new URLSearchParams(server.calls.find((c) => c.pathname.endsWith("/oauth2/token")).body);
  assert.equal(exchange.get("grant_type"), "authorization_code");
  assert.ok(exchange.get("code_verifier"));
});

test("a verified account outside the approved domains is refused and gets no session", async () => {
  const handle = gate(authServer({token: () => accessToken({email: "mallory@example.com"})}));
  const {callback} = await signIn(handle);

  assert.equal(callback.status, 403);
  assert.doesNotMatch(callback.headers.get("set-cookie") ?? "", /hp_status_session=[^;]/);
});

test("an unverified email on an approved domain is refused", async () => {
  const handle = gate(authServer({token: () => accessToken({email_verified: false})}));
  assert.equal((await signIn(handle)).callback.status, 403);
});

test("a lookalike domain is not an approved domain", async () => {
  const handle = gate(authServer({token: () => accessToken({email: "x@evilhashpass.tech"})}));
  assert.equal((await signIn(handle)).callback.status, 403);
  const sub = gate(authServer({token: () => accessToken({email: "x@hashpass.tech.evil.com"})}));
  assert.equal((await signIn(sub)).callback.status, 403);
});

test("a token for another audience or issuer is not accepted", async () => {
  for (const overrides of [{audience: "https://other.example.com"}, {issuer: "https://evil.example.com"}]) {
    const handle = gate(authServer({token: () => accessToken({}, overrides)}));
    assert.equal((await signIn(handle)).callback.status, 502);
  }
});

test("a callback with a wrong state or without the flow cookie is rejected before any token exchange", async () => {
  const server = authServer({token: () => accessToken()});
  const handle = gate(server);

  assert.equal((await signIn(handle, {state: "wrong"})).callback.status, 400);
  assert.equal((await get(handle, "/status/callback?code=abc&state=x")).status, 400);
  assert.equal(server.calls.filter((c) => c.pathname.endsWith("/oauth2/token")).length, 0);
});

test("a denied consent or provider error ends at a notice, not a session", async () => {
  const handle = gate(authServer());
  const login = await get(handle, "/status/login");
  const state = new URL(login.headers.get("location")).searchParams.get("state");
  const response = await get(handle, `/status/callback?error=access_denied&state=${state}`, cookiesOf(login));
  assert.equal(response.status, 403);
});

test("removing a domain from the allowlist revokes sessions that were already issued", async () => {
  const issued = gate(authServer({token: () => accessToken()}));
  const session = cookiesOf((await signIn(issued)).callback);
  const narrowed = gate(authServer(), {allowedEmailDomains: ["hashpass.app"]});
  assert.equal((await get(narrowed, "/status-gate/verify", session)).status, 302);
});

test("a session signed with a different secret is rejected", async () => {
  const session = cookiesOf((await signIn(gate(authServer({token: () => accessToken()})))).callback);
  const other = gate(authServer(), {serviceSecret: "another-secret"});
  assert.equal((await get(other, "/status-gate/verify", session)).status, 302);
});

test("logout clears the session, and the gate leaves unrelated paths to the caller", async () => {
  const handle = gate(authServer());
  const out = await get(handle, "/status/logout");
  assert.match(out.headers.get("set-cookie"), /hp_status_session=; .*Max-Age=0/);
  assert.equal(await get(handle, "/mcp"), null);
});

test("sign-in reports an outage instead of hanging when registration fails", async () => {
  const handle = gate(authServer({registerOk: false}));
  assert.equal((await get(handle, "/status/login")).status, 502);
});

test("incomplete configuration is refused at startup", () => {
  assert.throws(() => createStatusGate({issuer: ISSUER, resource: RESOURCE}), /Incomplete/);
});
