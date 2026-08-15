import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handleRequest } from '../router';
import { resetAdminDbCache, setAdminDbForTesting } from '../server';
import { createFakeSupabaseClient, type FakeUser } from '../test-utils/fake-supabase-client';

const OWNER: FakeUser = { id: 'owner-1', email: 'owner@example.com', token: 'owner-token' };
const OTHER_USER: FakeUser = { id: 'other-1', email: 'other@example.com', token: 'other-token' };

function useFakeDb(users: FakeUser[] = [OWNER, OTHER_USER]) {
  const client = createFakeSupabaseClient(users);
  setAdminDbForTesting(client as unknown as SupabaseClient);
  return client;
}

test.beforeEach(() => {
  process.env.QR_ANALYTICS_SECRET = 'a'.repeat(32);
});

test.afterEach(() => {
  setAdminDbForTesting(null);
  resetAdminDbCache();
  delete process.env.QR_ANALYTICS_SECRET;
});

function authed(token: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` } };
}

async function createLink(overrides: Record<string, unknown> = {}) {
  return handleRequest(
    new Request(
      'https://api.hashpass.link/api/v1/qr-links',
      authed(OWNER.token, {
        method: 'POST',
        body: JSON.stringify({ name: 'Chile 2026 flyer', destinationUrl: 'https://hashpass.tech/events/chile2026', ...overrides }),
      })
    )
  );
}

test('creating a QR link requires an authenticated session', async () => {
  useFakeDb();
  const response = await handleRequest(
    new Request('https://api.hashpass.link/api/v1/qr-links', {
      method: 'POST',
      body: JSON.stringify({ name: 'x', destinationUrl: 'https://hashpass.tech' }),
    })
  );
  assert.equal(response.status, 401);
});

test('creating a QR link rejects a missing name', async () => {
  useFakeDb();
  const response = await createLink({ name: '' });
  assert.equal(response.status, 400);
});

test('creating a QR link rejects a private/internal destination (SSRF guard)', async () => {
  useFakeDb();
  const response = await createLink({ destinationUrl: 'http://169.254.169.254/latest/meta-data' });
  assert.equal(response.status, 400);
});

test('creating a QR link succeeds and returns a public slug', async () => {
  useFakeDb();
  const response = await createLink();
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.name, 'Chile 2026 flyer');
  assert.equal(body.status, 'active');
  assert.match(body.publicSlug, /^[A-Za-z0-9_-]{8,32}$/);
  assert.equal(body.scanCount, 0);
});

test('list only returns the caller\'s own QR links', async () => {
  useFakeDb();
  await createLink({ name: 'Owner link' });
  await handleRequest(
    new Request(
      'https://api.hashpass.link/api/v1/qr-links',
      authed(OTHER_USER.token, {
        method: 'POST',
        body: JSON.stringify({ name: 'Other link', destinationUrl: 'https://hashpass.tech/other' }),
      })
    )
  );

  const response = await handleRequest(
    new Request('https://api.hashpass.link/api/v1/qr-links', authed(OWNER.token))
  );
  const body = await response.json();
  assert.equal(body.links.length, 1);
  assert.equal(body.links[0].name, 'Owner link');
});

test('another user cannot read or update someone else\'s QR link', async () => {
  useFakeDb();
  const created = await (await createLink()).json();

  const getResponse = await handleRequest(
    new Request(`https://api.hashpass.link/api/v1/qr-links/${created.id}`, authed(OTHER_USER.token))
  );
  assert.equal(getResponse.status, 404);

  const patchResponse = await handleRequest(
    new Request(`https://api.hashpass.link/api/v1/qr-links/${created.id}`, authed(OTHER_USER.token, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Hijacked' }),
    }))
  );
  assert.equal(patchResponse.status, 404);
});

test('owner can update name, destination, and pause/resume/archive the link', async () => {
  useFakeDb();
  const created = await (await createLink()).json();

  const paused = await handleRequest(
    new Request(`https://api.hashpass.link/api/v1/qr-links/${created.id}`, authed(OWNER.token, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'paused' }),
    }))
  );
  assert.equal(paused.status, 200);
  assert.equal((await paused.json()).status, 'paused');

  const archived = await handleRequest(
    new Request(`https://api.hashpass.link/api/v1/qr-links/${created.id}`, authed(OWNER.token, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived', name: 'Chile 2026 flyer (retired)' }),
    }))
  );
  const archivedBody = await archived.json();
  assert.equal(archivedBody.status, 'archived');
  assert.equal(archivedBody.name, 'Chile 2026 flyer (retired)');
  assert.ok(archivedBody.archivedAt);
});

test('a paused link 404s on the public redirect and is not scanned', async () => {
  const client = useFakeDb();
  const created = await (await createLink()).json();
  await handleRequest(
    new Request(`https://api.hashpass.link/api/v1/qr-links/${created.id}`, authed(OWNER.token, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'paused' }),
    }))
  );

  const redirect = await handleRequest(new Request(`https://api.hashpass.link/q/${created.publicSlug}`));
  assert.equal(redirect.status, 404);
  assert.equal(client._tables.get('qr_scan_events')?.size ?? 0, 0);
});

test('an unknown slug 404s on the public redirect', async () => {
  useFakeDb();
  const response = await handleRequest(new Request('https://api.hashpass.link/q/does-not-exist'));
  assert.equal(response.status, 404);
});

test('an active link redirects to its destination with campaign UTM params merged in, and logs a scan', async () => {
  const client = useFakeDb();
  const created = await (
    await createLink({ campaign: { source: 'flyer', medium: 'print', campaign: 'chile2026-launch' } })
  ).json();

  const redirect = await handleRequest(
    new Request(`https://api.hashpass.link/q/${created.publicSlug}`, {
      redirect: 'manual',
      headers: { 'user-agent': 'Mozilla/5.0 (iPhone)', 'x-forwarded-for': '203.0.113.7' },
    })
  );
  assert.equal(redirect.status, 302);
  const location = new URL(redirect.headers.get('location')!);
  assert.equal(location.origin + location.pathname, 'https://hashpass.tech/events/chile2026');
  assert.equal(location.searchParams.get('utm_source'), 'flyer');
  assert.equal(location.searchParams.get('utm_medium'), 'print');
  assert.equal(location.searchParams.get('utm_campaign'), 'chile2026-launch');

  assert.equal(client._tables.get('qr_scan_events')?.size, 1);
  const [scan] = [...(client._tables.get('qr_scan_events')?.values() ?? [])];
  assert.equal((scan as { device_type: string }).device_type, 'mobile');
  assert.equal((scan as { bot_classification: string }).bot_classification, 'human');
});

test('analytics reflects scans recorded since creation, and is owner-only', async () => {
  useFakeDb();
  const created = await (await createLink()).json();
  await handleRequest(new Request(`https://api.hashpass.link/q/${created.publicSlug}`, { redirect: 'manual' }));
  await handleRequest(new Request(`https://api.hashpass.link/q/${created.publicSlug}`, { redirect: 'manual' }));

  const forbidden = await handleRequest(
    new Request(`https://api.hashpass.link/api/v1/qr-links/${created.id}/analytics`, authed(OTHER_USER.token))
  );
  assert.equal(forbidden.status, 404);

  const analytics = await handleRequest(
    new Request(`https://api.hashpass.link/api/v1/qr-links/${created.id}/analytics`, authed(OWNER.token))
  );
  assert.equal(analytics.status, 200);
  const body = await analytics.json();
  assert.equal(body.totalScans, 2);
  assert.equal(body.humanScans, 2);
  assert.equal(body.botScans, 0);

  const list = await handleRequest(
    new Request('https://api.hashpass.link/api/v1/qr-links', authed(OWNER.token))
  );
  const listBody = await list.json();
  assert.equal(listBody.links[0].scanCount, 2);
});
