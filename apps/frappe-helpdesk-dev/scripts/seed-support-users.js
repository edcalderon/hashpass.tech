#!/usr/bin/env node
// Seeds the local Frappe Helpdesk instance with the two dedicated,
// least-privilege service users apps/mobile-app/.env.example documents
// (FRAPPE_SUPPORT_READ_API_KEY/SECRET, FRAPPE_SUPPORT_WRITE_API_KEY/SECRET),
// plus the HD Team those tickets route to (FRAPPE_SUPPORT_TEAM), then writes
// the resulting credentials into apps/mobile-app/.env.local.
//
// This is a throwaway local sim, not the production runbook: production
// permissioning (docs/operations/self-hosted-*.md) should scope the write
// user to HD Ticket create/update + HD Ticket Comment create only, and the
// read user to read-only on those same doctypes. Doing that split via the
// REST API from scratch on every fresh local site is a lot of Role
// Permission Manager plumbing for a disposable dev DB with fake tickets, so
// both service users here get the standard Frappe Helpdesk "Agent" role
// instead -- broader than the production target, acceptable only because
// this instance never holds real data and the mobile app's own client code
// (lib/server/frappe-helpdesk.ts) still keeps the read/write keys separate
// and never uses the write key for a read call or vice versa.
//
// Idempotent: safe to re-run against an already-seeded instance (skips
// create steps when the user/team already exists, always re-writes
// .env.local with the current values).

const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(PACKAGE_DIR, "../..");
const SELF_HOSTED_ENV = path.join(REPO_ROOT, "ops/self-hosted/.env");
const MOBILE_ENV_LOCAL = path.join(REPO_ROOT, "apps/mobile-app/.env.local");

const READ_USER_EMAIL = "support-read@local.hashpass.dev";
const WRITE_USER_EMAIL = "support-write@local.hashpass.dev";
const TEAM_NAME = process.env.FRAPPE_SUPPORT_TEAM || "HASHPASS";

function readDotEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

async function main() {
  const selfHostedEnv = readDotEnv(SELF_HOSTED_ENV);
  const adminPassword = process.env.FRAPPE_ADMIN_PASSWORD || selfHostedEnv.FRAPPE_ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error(`ERROR: FRAPPE_ADMIN_PASSWORD not found in ${SELF_HOSTED_ENV}.`);
    console.error("Bring the stack up first (pnpm --filter hashpass-frappe-helpdesk-dev run up).");
    process.exit(1);
  }

  const port = process.env.FRAPPE_LOCAL_HTTP_PORT || selfHostedEnv.FRAPPE_LOCAL_HTTP_PORT || "8083";
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`Seeding local Frappe Helpdesk at ${baseUrl}...`);
  const cookie = await login(baseUrl, "Administrator", adminPassword);

  await ensureTeam(baseUrl, cookie, TEAM_NAME);
  const readCreds = await ensureServiceUser(baseUrl, cookie, READ_USER_EMAIL, "Support Read (local dev)");
  const writeCreds = await ensureServiceUser(baseUrl, cookie, WRITE_USER_EMAIL, "Support Write (local dev)");

  writeEnvLocal({
    FRAPPE_BASE_URL: baseUrl,
    FRAPPE_SUPPORT_READ_API_KEY: readCreds.apiKey,
    FRAPPE_SUPPORT_READ_API_SECRET: readCreds.apiSecret,
    FRAPPE_SUPPORT_WRITE_API_KEY: writeCreds.apiKey,
    FRAPPE_SUPPORT_WRITE_API_SECRET: writeCreds.apiSecret,
    FRAPPE_SUPPORT_TEAM: TEAM_NAME,
  });

  console.log(`Wrote Frappe support credentials to ${path.relative(REPO_ROOT, MOBILE_ENV_LOCAL)}`);
  console.log("Restart the mobile app dev server to pick up the new .env.local values.");
}

async function login(baseUrl, usr, pwd) {
  const response = await fetch(`${baseUrl}/api/method/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ usr, pwd }),
  });
  if (!response.ok) {
    throw new Error(`Login failed (${response.status}): ${await response.text()}`);
  }
  const setCookie = response.headers.get("set-cookie") || "";
  // Frappe sends several Set-Cookie headers (sid, system_user, user_id,
  // full_name); fetch's Headers API folds multi-value headers into one
  // comma-joined string in Node, so pull just the sid= pair back out.
  const sidMatch = /sid=[^;,]+/.exec(setCookie);
  if (!sidMatch) throw new Error("Login succeeded but no session cookie (sid) was returned.");
  return sidMatch[0];
}

async function frappeCall(baseUrl, cookie, apiPath, { method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${apiPath}`, {
    method,
    headers: {
      Cookie: cookie,
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Frappe-CSRF-Token": "",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

async function ensureTeam(baseUrl, cookie, teamName) {
  const existing = await frappeCall(baseUrl, cookie, `/api/resource/HD Team/${encodeURIComponent(teamName)}`);
  if (existing.ok) {
    console.log(`HD Team "${teamName}" already exists.`);
    return;
  }

  console.log(`Creating HD Team "${teamName}"...`);
  const created = await frappeCall(baseUrl, cookie, "/api/resource/HD Team", {
    method: "POST",
    body: { team_name: teamName },
  });
  if (!created.ok) {
    throw new Error(`Failed to create HD Team "${teamName}": ${JSON.stringify(created.payload)}`);
  }
}

async function ensureServiceUser(baseUrl, cookie, email, fullName) {
  const existing = await frappeCall(baseUrl, cookie, `/api/resource/User/${encodeURIComponent(email)}`);
  if (!existing.ok) {
    console.log(`Creating service user ${email}...`);
    const created = await frappeCall(baseUrl, cookie, "/api/resource/User", {
      method: "POST",
      body: {
        email,
        first_name: fullName,
        send_welcome_email: 0,
        roles: [{ role: "Agent" }],
      },
    });
    if (!created.ok) {
      throw new Error(`Failed to create user ${email}: ${JSON.stringify(created.payload)}`);
    }
  } else {
    console.log(`Service user ${email} already exists.`);
  }

  console.log(`Generating API keys for ${email}...`);
  const keys = await frappeCall(baseUrl, cookie, "/api/method/frappe.core.doctype.user.user.generate_keys", {
    method: "POST",
    body: { user: email },
  });
  if (!keys.ok) {
    throw new Error(`Failed to generate API keys for ${email}: ${JSON.stringify(keys.payload)}`);
  }
  const apiSecret = keys.payload.message?.api_secret;
  if (!apiSecret) {
    throw new Error(`generate_keys for ${email} did not return an api_secret: ${JSON.stringify(keys.payload)}`);
  }

  const userDoc = await frappeCall(baseUrl, cookie, `/api/resource/User/${encodeURIComponent(email)}?fields=["api_key"]`);
  const apiKey = userDoc.payload.data?.api_key;
  if (!userDoc.ok || !apiKey) {
    throw new Error(`Could not read api_key back for ${email}: ${JSON.stringify(userDoc.payload)}`);
  }

  return { apiKey, apiSecret };
}

function writeEnvLocal(values) {
  const existingLines = fs.existsSync(MOBILE_ENV_LOCAL)
    ? fs.readFileSync(MOBILE_ENV_LOCAL, "utf8").split("\n")
    : [];
  const remainingKeys = new Set(Object.keys(values));
  const outLines = [];

  for (const line of existingLines) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (match && remainingKeys.has(match[1])) {
      outLines.push(`${match[1]}=${values[match[1]]}`);
      remainingKeys.delete(match[1]);
    } else {
      outLines.push(line);
    }
  }

  while (outLines.length && outLines[outLines.length - 1] === "") outLines.pop();

  if (remainingKeys.size > 0) {
    outLines.push("", "# apps/frappe-helpdesk-dev/scripts/seed-support-users.js -- local Frappe Helpdesk");
    for (const key of remainingKeys) {
      outLines.push(`${key}=${values[key]}`);
    }
  }

  fs.writeFileSync(MOBILE_ENV_LOCAL, `${outLines.join("\n")}\n`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
