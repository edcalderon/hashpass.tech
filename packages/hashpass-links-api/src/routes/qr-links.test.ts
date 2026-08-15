import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handleRequest } from '../router';
import { archiveExpiredQrLinks } from './qr-links';
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

test('an owner can create and edit a safe custom QR slug', async () => {
  useFakeDb();
  const created = await (await createLink({ publicSlug: 'summer-club' })).json();
  assert.equal(created.publicSlug, 'summer-club');

  const updated = await handleRequest(
    new Request(`https://api.hashpass.link/api/v1/qr-links/${created.id}`, authed(OWNER.token, {
      method: 'PATCH',
      body: JSON.stringify({ publicSlug: 'club-night-2026' }),
    }))
  );
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).publicSlug, 'club-night-2026');
});

test('an authenticated owner can check whether a custom QR slug is available', async () => {
  useFakeDb();
  await createLink({ publicSlug: 'summer-club' });

  const taken = await handleRequest(
    new Request('https://api.hashpass.link/api/v1/qr-links/slug-availability?slug=summer-club', authed(OWNER.token))
  );
  assert.deepEqual(await taken.json(), { available: false, slug: 'summer-club' });

  const available = await handleRequest(
    new Request('https://api.hashpass.link/api/v1/qr-links/slug-availability?slug=fresh-club', authed(OWNER.token))
  );
  assert.deepEqual(await available.json(), { available: true, slug: 'fresh-club' });
});

test('a scheduled QR link only redirects inside its configured availability window', async () => {
  useFakeDb();
  const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const created = await (await createLink({ startsAt, expiresAt })).json();

  assert.equal(created.startsAt, startsAt);
  assert.equal(created.expiresAt, expiresAt);

  const redirect = await handleRequest(new Request(`https://api.hashpass.link/q/${created.publicSlug}`, { redirect: 'manual' }));
  assert.equal(redirect.status, 404);
});

test('creating a scheduled QR link rejects an end time that is not after its start time', async () => {
  useFakeDb();
  const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const response = await createLink({ startsAt, expiresAt });
  assert.equal(response.status, 400);
});

test('the expiry sweep archives active QR links after their end time', async () => {
  const client = useFakeDb();
  const created = await (await createLink({ expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() })).json();
  const row = client._tables.get('qr_links')?.get(created.id)!;
  row.expires_at = new Date(Date.now() - 60 * 1000).toISOString();

  const archived = await archiveExpiredQrLinks(new Date());

  assert.equal(archived, 1);
  assert.equal(row.status, 'archived');
  assert.equal(typeof row.archived_at, 'string');
});

test('a past expiry is exposed as expired to QR-link management clients', async () => {
  const client = useFakeDb();
  const created = await (await createLink()).json();
  const row = client._tables.get('qr_links')?.get(created.id)!;
  row.expires_at = new Date(Date.now() - 60 * 1000).toISOString();

  const list = await handleRequest(new Request('https://api.hashpass.link/api/v1/qr-links', authed(OWNER.token)));
  assert.equal((await list.json()).links[0].status, 'expired');

  const detail = await handleRequest(
    new Request(`https://api.hashpass.link/api/v1/qr-links/${created.id}`, authed(OWNER.token))
  );
  assert.equal((await detail.json()).status, 'expired');
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

test('owner can delete a QR link, removing it from management and public redirects', async () => {
  const client = useFakeDb();
  const created = await (await createLink()).json();

  const deleted = await handleRequest(
    new Request(`https://api.hashpass.link/api/v1/qr-links/${created.id}`, authed(OWNER.token, { method: 'DELETE' }))
  );
  assert.equal(deleted.status, 204);
  assert.equal(typeof client._tables.get('qr_links')?.get(created.id)?.deleted_at, 'string');

  const list = await handleRequest(new Request('https://api.hashpass.link/api/v1/qr-links', authed(OWNER.token)));
  assert.deepEqual((await list.json()).links, []);

  const redirect = await handleRequest(new Request(`https://api.hashpass.link/q/${created.publicSlug}`, { redirect: 'manual' }));
  assert.equal(redirect.status, 404);
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

test('a stalled analytics insert cannot block a public QR redirect', async () => {
  const client = useFakeDb();
  const created = await (await createLink()).json();
  const stalledDb = {
    ...client,
    from(table: string) {
      if (table === 'qr_scan_events') return { insert: () => new Promise(() => {}) };
      return client.from(table);
    },
  };
  setAdminDbForTesting(stalledDb as unknown as SupabaseClient);

  const result = await Promise.race([
    handleRequest(new Request(`https://api.hashpass.link/q/${created.publicSlug}`, { redirect: 'manual' })),
    new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 300)),
  ]);

  assert.notEqual(result, 'timed-out');
  assert.equal((result as Response).status, 302);
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

test('analytics and scan counts include every scan beyond PostgREST\'s response cap', async () => {
  const client = useFakeDb();
  const created = await (await createLink()).json();
  const scanEvents = client._tables.get('qr_scan_events') ?? new Map();
  client._tables.set('qr_scan_events', scanEvents);
  const now = Date.now();

  for (let index = 0; index < 1005; index += 1) {
    scanEvents.set(`scan-${index}`, {
      id: `scan-${index}`,
      qr_link_id: created.id,
      scanned_at: new Date(now - index * 1000).toISOString(),
      device_type: index % 2 === 0 ? 'mobile' : 'desktop',
      bot_classification: index % 3 === 0 ? 'bot' : 'human',
    });
  }

  const analytics = await handleRequest(
    new Request(`https://api.hashpass.link/api/v1/qr-links/${created.id}/analytics`, authed(OWNER.token))
  );
  const analyticsBody = await analytics.json();
  assert.equal(analyticsBody.totalScans, 1005);
  assert.equal(analyticsBody.humanScans + analyticsBody.botScans, 1005);
  assert.equal(Object.values(analyticsBody.scansByDevice).reduce((sum: number, count) => sum + Number(count), 0), 1005);

  const list = await handleRequest(new Request('https://api.hashpass.link/api/v1/qr-links', authed(OWNER.token)));
  assert.equal((await list.json()).links[0].scanCount, 1005);
});
