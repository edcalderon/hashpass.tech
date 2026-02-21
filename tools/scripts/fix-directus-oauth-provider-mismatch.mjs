#!/usr/bin/env node

/**
 * Fix Directus OAuth provider mismatches that cause INVALID_CREDENTIALS
 * during /auth/login/google/callback.
 *
 * It updates end-user records created with provider=default to provider=google
 * when they match the configured DEFAULT_ROLE_ID and already have an external_identifier.
 *
 * Usage:
 *   set -a; source .env; set +a
 *   node tools/scripts/fix-directus-oauth-provider-mismatch.mjs
 *   node tools/scripts/fix-directus-oauth-provider-mismatch.mjs --dry-run
 */

const DIRECTUS_URL =
  process.env.DIRECTUS_URL ||
  process.env.EXPO_PUBLIC_DIRECTUS_URL ||
  'http://localhost:8055';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.DIRECTUS_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DEFAULT_ROLE_ID = process.env.DEFAULT_ROLE_ID;
const TARGET_PROVIDER = process.env.TARGET_OAUTH_PROVIDER || 'google';
const DRY_RUN = process.argv.includes('--dry-run');

const required = [
  ['ADMIN_EMAIL or DIRECTUS_ADMIN_EMAIL', ADMIN_EMAIL],
  ['ADMIN_PASSWORD', ADMIN_PASSWORD],
  ['DEFAULT_ROLE_ID', DEFAULT_ROLE_ID],
];

for (const [name, value] of required) {
  if (!value) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      payload?.errors?.[0]?.message ||
      payload?.error ||
      payload?.message ||
      `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return payload;
}

async function login() {
  const payload = await requestJson(`${DIRECTUS_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }),
  });

  return payload?.data?.access_token;
}

async function getMismatchedUsers(adminToken) {
  const url = new URL('/users', DIRECTUS_URL);
  url.searchParams.set('fields', 'id,email,provider,role,external_identifier');
  url.searchParams.set('limit', '500');
  url.searchParams.set('filter[role][_eq]', DEFAULT_ROLE_ID);
  url.searchParams.set('filter[provider][_eq]', 'default');
  url.searchParams.set('filter[external_identifier][_nnull]', 'true');

  const payload = await requestJson(url.toString(), {
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  return payload?.data || [];
}

async function patchUserProvider(adminToken, userId) {
  await requestJson(`${DIRECTUS_URL}/users/${userId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ provider: TARGET_PROVIDER }),
  });
}

async function main() {
  const adminToken = await login();
  if (!adminToken) {
    throw new Error('Failed to obtain admin token from Directus.');
  }

  const users = await getMismatchedUsers(adminToken);

  console.log(`Found ${users.length} mismatched user(s).`);
  if (users.length === 0) return;

  for (const user of users) {
    console.log(`- ${user.email} (${user.id}) provider=${user.provider} -> ${TARGET_PROVIDER}`);
    if (!DRY_RUN) {
      await patchUserProvider(adminToken, user.id);
    }
  }

  if (DRY_RUN) {
    console.log('Dry run complete. No updates were written.');
  } else {
    console.log('Provider mismatch update complete.');
  }
}

main().catch((error) => {
  console.error('Provider mismatch fix failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});

