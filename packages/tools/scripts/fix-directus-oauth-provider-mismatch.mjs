#!/usr/bin/env node

/**
 * Fix Directus OAuth provider mismatches that cause INVALID_PROVIDER /
 * INVALID_CREDENTIALS during /auth/login/google/callback.
 *
 * Directus expects Google-linked users to have:
 * - provider = google
 * - external_identifier = the Google email address
 *
 * This script updates end-user records created with provider=default when
 * they match the configured DEFAULT_ROLE_ID.
 *
 * Usage:
 *   set -a; source .env; set +a
 *   node packages/tools/scripts/fix-directus-oauth-provider-mismatch.mjs
 *   node packages/tools/scripts/fix-directus-oauth-provider-mismatch.mjs --dry-run
 */

const DIRECTUS_URL =
  process.env.DIRECTUS_URL ||
  process.env.EXPO_PUBLIC_DIRECTUS_URL ||
  'http://localhost:8055';

const directusAdminEmail = process.env.ADMIN_EMAIL || process.env.DIRECTUS_ADMIN_EMAIL;
const directusAdminPassword = process.env.ADMIN_PASSWORD;
const defaultRoleId = process.env.DEFAULT_ROLE_ID;
const TARGET_PROVIDER = process.env.TARGET_OAUTH_PROVIDER || 'google';
const DRY_RUN = process.argv.includes('--dry-run');

const required = [
  ['ADMIN_EMAIL or DIRECTUS_ADMIN_EMAIL', directusAdminEmail],
  ['ADMIN_PASSWORD', directusAdminPassword],
  ['DEFAULT_ROLE_ID', defaultRoleId],
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
      email: directusAdminEmail,
      password: directusAdminPassword,
    }),
  });

  return payload?.data?.access_token;
}

async function getMismatchedUsers(adminToken) {
  const url = new URL('/users', DIRECTUS_URL);
  url.searchParams.set('fields', 'id,email,provider,role,external_identifier');
  url.searchParams.set('limit', '500');
  url.searchParams.set('filter[role][_eq]', defaultRoleId);

  const payload = await requestJson(url.toString(), {
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  const users = payload?.data || [];

  return users.filter((user) => {
    if (!user || typeof user.email !== 'string') return false;

    if (user.provider === 'default') {
      return true;
    }

    return user.provider === TARGET_PROVIDER && user.external_identifier !== user.email;
  });
}

async function patchUserProvider(adminToken, user) {
  await requestJson(`${DIRECTUS_URL}/users/${user.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider: TARGET_PROVIDER,
      external_identifier: user.email,
    }),
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
    console.log(
      `- ${user.email} (${user.id}) provider=${user.provider} -> ${TARGET_PROVIDER}, ` +
      `external_identifier -> ${user.email}`
    );
    if (!DRY_RUN) {
      await patchUserProvider(adminToken, user);
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
