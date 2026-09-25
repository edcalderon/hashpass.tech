import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handleRequest } from '../router';
import { setAdminDbForTesting } from '../server';

const visits: Record<string, unknown>[] = [];
let insertResult: () => Promise<{ error: unknown }>;

test.beforeEach(() => {
  visits.length = 0;
  insertResult = async () => ({ error: null });
  setAdminDbForTesting({ from(table: string) {
    assert.equal(table, 'invite_scan_events');
    return { insert(row: Record<string, unknown>) {
      return { async abortSignal(signal: AbortSignal) {
        assert.equal(signal.aborted, false);
        const result = await insertResult();
        if (!result.error) visits.push(row);
        return result;
      } };
    } };
  } } as unknown as SupabaseClient);
});
test.afterEach(() => setAdminDbForTesting(null));

function open(query = '?code=9899', init?: RequestInit) {
  return handleRequest(new Request(`https://invite.hashpass.app/${query}`, init));
}

test('printed invite redirects to registration with a verified business-pass return path', async () => {
  for (let i = 0; i < 2; i++) {
    const response = await open('?code=9899&redirect=https://evil.example');
    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get('location'),
      'https://hashpass.tech/auth?returnTo=%2Fdashboard%2Fwallet%3Fsection%3Dpasses%26inviteCode%3D9899',
    );
    assert.match(response.headers.get('cache-control')!, /no-store/);
  }
  assert.equal(visits.length, 2);
  assert.equal(visits[0].invite_code, '9899');
  assert.ok(Number.isFinite(Date.parse(visits[0].scanned_at as string)));
  assert.deepEqual(Object.keys(visits[0]).sort(), ['bot_classification', 'device_type', 'invite_code', 'scanned_at']);
});

test('redirect waits for the database acknowledgement', async () => {
  let resolve!: (value: { error: unknown }) => void;
  insertResult = () => new Promise((r) => { resolve = r; });
  let completed = false;
  const response = open().then((r) => { completed = true; return r; });
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(completed, false);
  resolve({ error: null });
  assert.equal((await response).status, 302);
  assert.equal(visits.length, 1);
});

test('database rejection or exception produces a retryable, uncached error', async () => {
  for (const result of [async () => ({ error: { message: 'unavailable' } }), async () => { throw new Error('offline'); }]) {
    insertResult = result;
    const response = await open();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '5');
    assert.equal(response.headers.get('location'), null);
    assert.match(response.headers.get('cache-control')!, /no-store/);
  }
  assert.equal(visits.length, 0);
});

test('HEAD, prefetch and bare-domain probes redirect without inflating counts', async () => {
  const probes: RequestInit[] = [{ method: 'HEAD' }, { headers: { purpose: 'prefetch' } }, { headers: { 'sec-purpose': 'prefetch;prerender' } }];
  for (const init of probes) {
    assert.equal((await open('?code=9899', init)).status, 302);
  }
  assert.equal((await open('')).headers.get('location'), 'https://hashpass.tech/auth');
  assert.equal(visits.length, 0);
});

test('invalid and duplicate codes are rejected without persistence', async () => {
  for (const query of ['?code=', '?code=a&code=b', '?code=%0A', '?code=' + 'a'.repeat(65)]) {
    assert.equal((await open(query)).status, 400);
  }
  assert.equal(visits.length, 0);
});

test('bots are recorded separately and other codes retain their identity', async () => {
  await open('?code=other-code', { headers: { 'user-agent': 'Googlebot' } });
  assert.equal(visits[0].invite_code, 'other-code');
  assert.equal(visits[0].bot_classification, 'bot');
});

test('invite host does not expose other API routes or accept POST', async () => {
  assert.equal((await open('api/health')).status, 404);
  assert.equal((await open('?code=9899', { method: 'POST' })).status, 405);
  const normal = await handleRequest(new Request('https://hashpass.link/?code=9899'));
  assert.equal(normal.headers.get('location'), 'https://hashpass.club/qr/');
  assert.equal(visits.length, 0);
});
