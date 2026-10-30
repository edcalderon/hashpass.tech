import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handleRequest } from '../router';
import { resetAdminDbCache, setAdminDbForTesting } from '../server';
import { createFakeSupabaseClient } from '../test-utils/fake-supabase-client';
import { buildArtworkEmailMessage, getArtworkEmailCopy, resolveArtworkMailerConfig } from './attending-artworks';

const shareKey = 'artwork-token-' + 'a'.repeat(32);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);

function useFakeDb() {
  const client = createFakeSupabaseClient();
  const tokenHash = createHash('sha256').update(shareKey).digest('hex');
  client._tables.set('attending_artwork_shares', new Map([[
    'share-1',
    {
      id: 'share-1',
      token_hash: tokenHash,
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
  client._storage.set('attending-artworks', new Map([['share-1.png', new Blob([PNG], { type: 'image/png' })]]));
  setAdminDbForTesting(client as unknown as SupabaseClient);
  process.env.PUBLIC_ARTWORK_SHARE_ORIGIN = 'https://hpass.id';
  return client;
}

test.afterEach(() => {
  setAdminDbForTesting(null);
  resetAdminDbCache();
  delete process.env.PUBLIC_ARTWORK_SHARE_ORIGIN;
});

test('serves artwork bytes from the first-party image URL', async () => {
  useFakeDb();
  const response = await handleRequest(new Request(`https://hpass.id/a/${shareKey}/image`));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('content-disposition'), 'inline; filename="hashpass-event-artwork.png"');
  assert.equal(response.headers.get('location'), null);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), PNG);
});

test('advertises the first-party image URL in social metadata', async () => {
  useFakeDb();
  const response = await handleRequest(new Request(`https://hpass.id/a/${shareKey}`));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, new RegExp(`og:image" content="https://hpass\\.id/a/${shareKey}/image`));
  assert.match(html, new RegExp(`twitter:image" content="https://hpass\\.id/a/${shareKey}/image`));
  assert.doesNotMatch(html, /supabase\.co/);
});

test('keeps tenant-event artwork images on the short-link origin', async () => {
  const client = useFakeDb();
  const share = client._tables.get('attending_artwork_shares')?.get('share-1');
  if (!share) throw new Error('Expected fake artwork share');
  Object.assign(share, {
    event_slug: 'bsl',
    event_name: 'Blockchain Summit Latam Colombia 2026',
    event_url: 'https://bsl.hashpass.tech/attending/bsl/',
  });

  const response = await handleRequest(new Request(`https://hpass.id/a/${shareKey}`));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, new RegExp(`og:image" content="https://hpass\\.id/a/${shareKey}/image`));
  assert.match(html, new RegExp(`<img src="https://hpass\\.id/a/${shareKey}/image`));
  assert.doesNotMatch(html, /og:image\" content=\"https:\/\/bsl\.hashpass\.tech/);
});

test('renders localized artwork email previews with an inline PNG attachment', () => {
  const message = buildArtworkEmailMessage({
    attendeeName: 'Valentina',
    eventName: 'Blockchain Summit Latam Colombia 2026',
    shareUrl: 'https://bsl.hashpass.tech/attending/bsl/a/token',
    imageUrl: 'https://hpass.id/a/token/image',
    image: Buffer.from(PNG),
    locale: 'es',
  });

  assert.match(message.subject, /Tu arte del evento está listo/);
  assert.match(message.text, /Descargar PNG: https:\/\/hpass\.id\/a\/token\/image/);
  assert.match(message.html, /src="cid:hashpass-event-artwork"/);
  assert.equal(message.attachments[0]?.contentDisposition, 'inline');
  assert.equal(message.attachments[0]?.cid, 'hashpass-event-artwork');
  assert.deepEqual(message.attachments[0]?.content, Buffer.from(PNG));
});

test('uses the updates mailbox when the primary SMTP sender is not configured', () => {
  const config = resolveArtworkMailerConfig({
    NODEMAILER_HOST_UPDATES: 'smtp.hostinger.com',
    NODEMAILER_PORT_UPDATES: '465',
    NODEMAILER_USER_UPDATES: 'updates@hashpass.tech',
    NODEMAILER_PASS_UPDATES: 'x'.repeat(12),
    NODEMAILER_FROM_UPDATES: 'updates@hashpass.tech',
  });

  assert.deepEqual(config, {
    host: 'smtp.hostinger.com',
    port: '465',
    user: 'updates@hashpass.tech',
    pass: 'x'.repeat(12),
    from: 'updates@hashpass.tech',
    suffix: '_UPDATES',
  });
  assert.equal(getArtworkEmailCopy('en', 'Joe', 'BSL').openLabel, 'Open your artwork');
});
