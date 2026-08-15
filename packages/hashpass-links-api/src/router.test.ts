import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { challengeHash } from '@hashpass/backend';
import { handleRequest } from './router';
import { resetAdminDbCache, setAdminDbForTesting } from './server';
import { createFakeSupabaseClient, type FakeUser } from './test-utils/fake-supabase-client';

const MOBILE_USER: FakeUser = { id: 'user-1', email: 'approver@example.com', token: 'mobile-session-token' };

function useFakeDb(users: FakeUser[] = [MOBILE_USER]) {
  const client = createFakeSupabaseClient(users);
  setAdminDbForTesting(client as unknown as SupabaseClient);
  return client;
}

test.afterEach(() => {
  setAdminDbForTesting(null);
  resetAdminDbCache();
});

function extractCookieValue(setCookieHeader: string | null, name: string): string {
  const match = setCookieHeader?.match(new RegExp(`${name}=([^;]+)`));
  if (!match) throw new Error(`Missing ${name} cookie in response`);
  return match[1];
}

// A PKCE verifier/challenge pair matching the real verifyCodeVerifier logic
// (challengeHash(verifier) === challenge).
function pkcePair() {
  const codeVerifier = 'verifier-' + Math.random().toString(36).slice(2);
  return { codeVerifier, codeChallenge: challengeHash(codeVerifier) };
}

async function createChallengeRequest(codeChallenge: string) {
  return handleRequest(
    new Request('https://api.hashpass.link/api/v1/auth/qr/challenges', {
      method: 'POST',
      body: JSON.stringify({ codeChallenge }),
    })
  );
}

async function driveFullFlow() {
  const { codeVerifier, codeChallenge } = pkcePair();

  const createResponse = await createChallengeRequest(codeChallenge);
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  const binding = extractCookieValue(createResponse.headers.get('set-cookie'), 'hp_qr_binding');

  return { created, binding, codeVerifier };
}

test('full challenge -> approve -> exchange flow issues a real session', async () => {
  useFakeDb();
  const { created, binding, codeVerifier } = await driveFullFlow();

  const pollBeforeApproval = await handleRequest(
    new Request(`https://api.hashpass.link/api/v1/auth/qr/challenges/${created.id}?state=${created.state}`, {
      headers: { cookie: `hp_qr_binding=${binding}` },
    })
  );
  assert.equal((await pollBeforeApproval.json()).status, 'pending');

  const approveResponse = await handleRequest(
    new Request(`https://api.hashpass.link/api/v1/auth/qr/challenges/${created.id}/approve`, {
      method: 'POST',
      headers: { authorization: `Bearer ${MOBILE_USER.token}` },
      body: JSON.stringify({ decision: 'approve' }),
    })
  );
  assert.equal(approveResponse.status, 200);
  assert.equal((await approveResponse.json()).status, 'approved');

  const pollAfterApproval = await handleRequest(
    new Request(`https://api.hashpass.link/api/v1/auth/qr/challenges/${created.id}?state=${created.state}`, {
      headers: { cookie: `hp_qr_binding=${binding}` },
    })
  );
  const polled = await pollAfterApproval.json();
  assert.equal(polled.status, 'approved');
  assert.ok(polled.authorizationCode);

  const exchangeBody = JSON.stringify({
    challengeId: created.id,
    authorizationCode: polled.authorizationCode,
    codeVerifier,
    state: created.state,
  });
  const exchangeResponse = await handleRequest(
    new Request('https://api.hashpass.link/api/v1/auth/qr/exchange', {
      method: 'POST',
      headers: { cookie: `hp_qr_binding=${binding}` },
      body: exchangeBody,
    })
  );
  assert.equal(exchangeResponse.status, 200);
  const exchanged = await exchangeResponse.json();
  assert.equal(exchanged.status, 'consumed');
  assert.equal(exchanged.userId, MOBILE_USER.id);
  assert.equal(exchanged.session.accessToken, `access-${MOBILE_USER.id}`);
  assert.equal(exchanged.session.refreshToken, `refresh-${MOBILE_USER.id}`);

  // A sequential replay after the first exchange already completed is
  // caught by the initial `data.status !== 'approved'` check (status is now
  // 'consumed') and reported as 400 -- the `.eq('status','approved')`
  // conditional update's own 409 branch guards the narrower race where two
  // exchange attempts both pass that initial check concurrently.
  const replayResponse = await handleRequest(
    new Request('https://api.hashpass.link/api/v1/auth/qr/exchange', {
      method: 'POST',
      headers: { cookie: `hp_qr_binding=${binding}` },
      body: exchangeBody,
    })
  );
  assert.equal(replayResponse.status, 400);
});

test('concurrent exchange attempts race safely: exactly one succeeds', async () => {
  useFakeDb();
  const { created, binding, codeVerifier } = await driveFullFlow();

  await handleRequest(
    new Request(`https://api.hashpass.link/api/v1/auth/qr/challenges/${created.id}/approve`, {
      method: 'POST',
      headers: { authorization: `Bearer ${MOBILE_USER.token}` },
      body: JSON.stringify({ decision: 'approve' }),
    })
  );
  const polled = await (
    await handleRequest(
      new Request(`https://api.hashpass.link/api/v1/auth/qr/challenges/${created.id}?state=${created.state}`, {
        headers: { cookie: `hp_qr_binding=${binding}` },
      })
    )
  ).json();

  const exchangeBody = JSON.stringify({
    challengeId: created.id,
    authorizationCode: polled.authorizationCode,
    codeVerifier,
    state: created.state,
  });
  const attempt = () =>
    handleRequest(
      new Request('https://api.hashpass.link/api/v1/auth/qr/exchange', {
        method: 'POST',
        headers: { cookie: `hp_qr_binding=${binding}` },
        body: exchangeBody,
      })
    );

  const [first, second] = await Promise.all([attempt(), attempt()]);
  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [200, 409]);
});

test('deny decision blocks exchange', async () => {
  useFakeDb();
  const { created, binding, codeVerifier } = await driveFullFlow();

  const denyResponse = await handleRequest(
    new Request(`https://api.hashpass.link/api/v1/auth/qr/challenges/${created.id}/approve`, {
      method: 'POST',
      headers: { authorization: `Bearer ${MOBILE_USER.token}` },
      body: JSON.stringify({ decision: 'deny' }),
    })
  );
  assert.equal((await denyResponse.json()).status, 'denied');

  const exchangeResponse = await handleRequest(
    new Request('https://api.hashpass.link/api/v1/auth/qr/exchange', {
      method: 'POST',
      headers: { cookie: `hp_qr_binding=${binding}` },
      body: JSON.stringify({
        challengeId: created.id,
        authorizationCode: 'irrelevant',
        codeVerifier,
        state: created.state,
      }),
    })
  );
  assert.equal(exchangeResponse.status, 400);
});

test('approve requires an authenticated app session', async () => {
  useFakeDb();
  const { created } = await driveFullFlow();

  const response = await handleRequest(
    new Request(`https://api.hashpass.link/api/v1/auth/qr/challenges/${created.id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ decision: 'approve' }),
    })
  );
  assert.equal(response.status, 401);
});

test('polling with the wrong browser binding cookie is rejected', async () => {
  useFakeDb();
  const { created } = await driveFullFlow();

  const response = await handleRequest(
    new Request(`https://api.hashpass.link/api/v1/auth/qr/challenges/${created.id}?state=${created.state}`, {
      headers: { cookie: 'hp_qr_binding=wrong-binding-value' },
    })
  );
  assert.equal(response.status, 403);
});

test('an expired challenge cannot be approved or exchanged', async () => {
  const client = useFakeDb();
  const { created, binding, codeVerifier } = await driveFullFlow();

  const row = client._tables.get('qr_auth_challenges')?.get(created.id);
  assert.ok(row);
  (row as { expires_at: string }).expires_at = new Date(Date.now() - 1000).toISOString();

  const pollResponse = await handleRequest(
    new Request(`https://api.hashpass.link/api/v1/auth/qr/challenges/${created.id}?state=${created.state}`, {
      headers: { cookie: `hp_qr_binding=${binding}` },
    })
  );
  assert.equal((await pollResponse.json()).status, 'expired');

  const approveResponse = await handleRequest(
    new Request(`https://api.hashpass.link/api/v1/auth/qr/challenges/${created.id}/approve`, {
      method: 'POST',
      headers: { authorization: `Bearer ${MOBILE_USER.token}` },
      body: JSON.stringify({ decision: 'approve' }),
    })
  );
  assert.equal(approveResponse.status, 409);

  const exchangeResponse = await handleRequest(
    new Request('https://api.hashpass.link/api/v1/auth/qr/exchange', {
      method: 'POST',
      headers: { cookie: `hp_qr_binding=${binding}` },
      body: JSON.stringify({ challengeId: created.id, authorizationCode: 'x', codeVerifier, state: created.state }),
    })
  );
  assert.equal(exchangeResponse.status, 400);
});

test('health check responds ok', async () => {
  const response = await handleRequest(new Request('https://api.hashpass.link/api/health'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'ok');
});

test('phase 2 routes report not-yet-live', async () => {
  const response = await handleRequest(new Request('https://api.hashpass.link/api/v1/qr-links'));
  assert.equal(response.status, 501);
});
