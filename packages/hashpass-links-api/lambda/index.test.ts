import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handler } from './index';
import { resetAdminDbCache, setAdminDbForTesting } from '../src/server';
import { createFakeSupabaseClient } from '../src/test-utils/fake-supabase-client';

test.afterEach(() => {
  setAdminDbForTesting(null);
  resetAdminDbCache();
});

test('allows the HashPass app origin to preflight QR approval requests', async () => {
  const response = await handler({
    version: '2.0',
    headers: { origin: 'https://hashpass.tech' },
    requestContext: { http: { method: 'OPTIONS' } },
  });

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers['access-control-allow-origin'], 'https://hashpass.tech');
  assert.equal(response.headers['access-control-allow-credentials'], 'true');
  assert.match(response.headers['access-control-allow-methods'], /POST/);
});

test('allows CBWeek production to preflight QR approval requests', async () => {
  const response = await handler({
    version: '2.0',
    headers: { origin: 'https://cbweek.hashpass.tech' },
    requestContext: { http: { method: 'OPTIONS' } },
  });

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers['access-control-allow-origin'], 'https://cbweek.hashpass.tech');
  assert.equal(response.headers['access-control-allow-credentials'], 'true');
});

test('an EventBridge scheduled event archives expired QR links', async () => {
  const client = createFakeSupabaseClient();
  setAdminDbForTesting(client as unknown as SupabaseClient);
  const id = 'expired-link';
  client._tables.set('qr_links', new Map([[id, {
    id,
    status: 'active',
    expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
    deleted_at: null,
  }]]));

  const response = await handler({ source: 'aws.events', 'detail-type': 'Scheduled Event' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { archived: 1, deletedAttendingArtworks: 0 });
  assert.equal(client._tables.get('qr_links')?.get(id)?.status, 'archived');
});

test('encodes first-party artwork images as binary Lambda responses', async () => {
  const client = createFakeSupabaseClient();
  setAdminDbForTesting(client as unknown as SupabaseClient);
  const token = 'artwork-token-' + 'a'.repeat(32);
  client._tables.set('attending_artwork_shares', new Map([[
    'share-1',
    {
      id: 'share-1',
      token_hash: createHash('sha256').update(token).digest('hex'),
      object_path: 'share-1.png',
      event_slug: 'community',
      event_name: 'A Community Event',
      attendee_name: 'Alex Rivera',
      caption: 'A shareable event moment',
      event_url: 'https://hashpass.club/attendings',
      locale: 'en',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
  ]]));
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  client._storage.set('attending-artworks', new Map([['share-1.png', new Blob([png], { type: 'image/png' })]]));

  const response = await handler({
    version: '2.0',
    requestContext: { domainName: 'hpass.id', http: { method: 'GET', path: `/a/${token}/image` } },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type'], 'image/png');
  assert.equal(response.isBase64Encoded, true);
  assert.deepEqual(new Uint8Array(Buffer.from(response.body, 'base64')), png);
});
