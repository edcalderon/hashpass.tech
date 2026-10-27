import {createHash, hkdfSync, randomBytes, timingSafeEqual} from "node:crypto";
import {createRemoteJWKSet, jwtVerify, SignJWT} from "jose";
import {identityFromPayload} from "./token-verifier.mjs";
import {isPlaneIdentityAllowed} from "./policy.mjs";

/**
 * Sign-in gate for the private status page at https://work.hashpass.tech/status.
 *
 * Caddy asks `/status-gate/verify` (forward_auth) before it serves the page. Without a valid session cookie the
 * visitor is sent to `/status/login`, which runs the OAuth authorization-code flow with PKCE against HashPass
 * auth (Better Auth). The returned access token is verified against the same JWKS and checked against the same
 * allowlist as the MCP gateway (`MCP_ALLOWED_EMAIL_DOMAINS`, e.g. hashpass.app and hashpass.tech), then exchanged
 * for a short-lived signed session cookie. Every failure closes the page: no valid cookie, no content.
 */

const SESSION_COOKIE = "hp_status_session";
const FLOW_COOKIE = "hp_status_flow";
const FLOW_SECONDS = 600;
const SCOPE = "openid email";

const parseCookies = (header) =>
  Object.fromEntries(
    (header || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index < 0 ? [part, ""] : [part.slice(0, index), part.slice(index + 1)];
      }),
  );

const cookie = (name, value, maxAge) =>
  `${name}=${value}; Path=/status; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a ?? ""));
  const right = Buffer.from(String(b ?? ""));
  return left.length === right.length && timingSafeEqual(left, right);
};

const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);

function notice(status, title, message, action) {
  const link = action ? `<a href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>` : "";
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>HASHPASS status</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--card:#f7f9fa;--line:#dfe3e8;--fg:#17181c;--muted:#565963;--accent:#0e7490}
@media (prefers-color-scheme:dark){:root{--bg:#111114;--card:#19191f;--line:#34343e;--fg:#fafafa;--muted:#b0b0bc;--accent:#22d3ee}}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:440px;width:100%;background:var(--card);border:1px solid var(--line);border-radius:24px;padding:24px}
h1{font-size:1.25rem;margin:0 0 8px}p{margin:0 0 16px;color:var(--muted)}
a{display:inline-flex;align-items:center;min-height:48px;padding:0 24px;border-radius:999px;background:var(--accent);color:#fff;font-weight:600;text-decoration:none}
</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${link}</main></body></html>
`, {status, headers: PAGE_HEADERS});
}

const redirect = (location, cookies = []) => {
  const headers = new Headers({location, "cache-control": "no-store", "x-robots-tag": "noindex"});
  for (const value of cookies) headers.append("set-cookie", value);
  return new Response(null, {status: 302, headers});
};

export function createStatusGate(options = {}) {
  const {
    publicOrigin = "https://work.hashpass.tech",
    issuer,
    resource,
    serviceSecret,
    sessionSecret,
    clientId: configuredClientId,
    jwksUrl = issuer ? `${issuer}/jwks` : "",
    keys,
    allowedSubjects = [],
    allowedEmails = [],
    allowedEmailDomains = [],
    sessionSeconds = 12 * 60 * 60,
    fetch: fetchImpl = globalThis.fetch,
  } = options;

  if (!issuer || !resource || (!sessionSecret && !serviceSecret)) throw new Error("Incomplete status gate configuration");

  const secret = sessionSecret
    ? new TextEncoder().encode(sessionSecret)
    : new Uint8Array(hkdfSync("sha256", serviceSecret, "hashpass-status-gate", "session-v1", 32));
  const resolveKey = keys ?? createRemoteJWKSet(new URL(jwksUrl), {timeoutDuration: 5000, cooldownDuration: 30000});
  const callbackUrl = `${publicOrigin}/status/callback`;
  const isAllowed = (identity) => isPlaneIdentityAllowed({...identity, allowedSubjects, allowedEmails, allowedEmailDomains});

  const sign = (claims, seconds) =>
    new SignJWT(claims).setProtectedHeader({alg: "HS256"}).setIssuedAt().setExpirationTime(`${seconds}s`).sign(secret);
  const read = async (token) => {
    if (!token) return null;
    try {
      return (await jwtVerify(token, secret, {algorithms: ["HS256"]})).payload;
    } catch {
      return null;
    }
  };

  // Better Auth supports unauthenticated dynamic registration; register once per process unless an id is configured.
  let registration = configuredClientId ? Promise.resolve(configuredClientId) : null;
  const clientId = () => {
    registration ??= (async () => {
      const response = await fetchImpl(`${issuer}/oauth2/register`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({
          client_name: "HASHPASS status page",
          redirect_uris: [callbackUrl],
          grant_types: ["authorization_code"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        }),
        signal: AbortSignal.timeout(10000),
      });
      const body = response.ok ? await response.json() : null;
      if (!body?.client_id) throw new Error("registration failed");
      return body.client_id;
    })().catch((error) => {
      registration = null;
      throw error;
    });
    return registration;
  };

  const retry = {href: "/status/login", label: "Sign in again"};

  async function verify(request) {
    const session = await read(parseCookies(request.headers.get("cookie"))[SESSION_COOKIE]);
    // The allowlist is re-checked on every request, so removing a domain takes effect before a session expires.
    if (session && isAllowed({subject: session.sub, email: session.email, emailVerified: true})) {
      return new Response("ok\n", {headers: {"cache-control": "no-store"}});
    }
    return redirect("/status/login");
  }

  async function login() {
    let id;
    try {
      id = await clientId();
    } catch {
      return notice(502, "Sign-in is unavailable", "HASHPASS auth did not accept the sign-in request. Try again in a minute.", retry);
    }
    const state = randomBytes(24).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    const target = new URL(`${issuer}/oauth2/authorize`);
    target.search = new URLSearchParams({
      response_type: "code",
      client_id: id,
      redirect_uri: callbackUrl,
      scope: SCOPE,
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      resource,
    }).toString();
    return redirect(target.toString(), [cookie(FLOW_COOKIE, await sign({st: state, cv: verifier}, FLOW_SECONDS), FLOW_SECONDS)]);
  }

  async function callback(request) {
    const url = new URL(request.url);
    const flow = await read(parseCookies(request.headers.get("cookie"))[FLOW_COOKIE]);
    if (!flow || !safeEqual(flow.st, url.searchParams.get("state"))) {
      return notice(400, "Sign-in expired", "That sign-in link is no longer valid. Start again.", retry);
    }
    const clearFlow = cookie(FLOW_COOKIE, "", 0);
    const code = url.searchParams.get("code");
    if (url.searchParams.get("error") || !code) {
      return notice(403, "Sign-in was not completed", "Access to the status page needs a HASHPASS team account.", retry);
    }

    let identity;
    try {
      const response = await fetchImpl(`${issuer}/oauth2/token`, {
        method: "POST",
        headers: {"content-type": "application/x-www-form-urlencoded", accept: "application/json"},
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: callbackUrl,
          client_id: await clientId(),
          code_verifier: flow.cv,
          resource,
        }).toString(),
        signal: AbortSignal.timeout(10000),
      });
      const tokens = response.ok ? await response.json() : null;
      if (typeof tokens?.access_token !== "string") throw new Error("no access token");
      const {payload} = await jwtVerify(tokens.access_token, resolveKey, {
        issuer,
        audience: resource,
        algorithms: ["EdDSA", "ES256", "RS256"],
        clockTolerance: 5,
      });
      identity = identityFromPayload(payload);
    } catch {
      return notice(502, "Sign-in could not be verified", "HASHPASS auth did not return a valid identity. Try again.", retry);
    }

    if (!isAllowed(identity)) {
      return notice(403, "This account is not approved", "The status page is limited to verified @hashpass.app and @hashpass.tech accounts.", {href: "/status/logout", label: "Use another account"});
    }
    const session = await sign({sub: identity.subject, email: identity.email}, sessionSeconds);
    return redirect("/status", [cookie(SESSION_COOKIE, session, sessionSeconds), clearFlow]);
  }

  const logout = () => redirect("/status/login", [cookie(SESSION_COOKIE, "", 0), cookie(FLOW_COOKIE, "", 0)]);

  /** Returns a Response for the gate's own paths, or null so the caller can route the request elsewhere. */
  return async function handle(request) {
    const {pathname} = new URL(request.url);
    if (pathname === "/status-gate/verify") return verify(request);
    if (request.method !== "GET" && request.method !== "HEAD") return pathname.startsWith("/status/") ? new Response("Method Not Allowed", {status: 405}) : null;
    if (pathname === "/status/login") return login();
    if (pathname === "/status/callback") return callback(request);
    if (pathname === "/status/logout") return logout();
    return null;
  };
}
