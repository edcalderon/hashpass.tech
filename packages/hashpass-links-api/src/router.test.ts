import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { challengeHash } from '@hashpass/backend';
import { handleRequest } from './router';
import { resetAdminDbCache, setAdminDbForTesting, setVerifyClientFactoryForTesting } from './server';
import { createFakeSupabaseClient, type FakeUser } from './test-utils/fake-supabase-client';

const MOBILE_USER: FakeUser = { id: 'user-1', email: 'approver@example.com', token: 'mobile-session-token' };
const BINDING_HEADER = 'x-hashpass-binding';

function useFakeDb(users: FakeUser[] = [MOBILE_USER]) {
  const client = createFakeSupabaseClient(users);
  setAdminDbForTesting(client as unknown as SupabaseClient);
  // The fake client has no real session-mutation side effects, so reusing
  // it as the "isolated verify client" too is fine here -- production code
  // (createVerifyClient() in server.ts) always builds a genuinely separate
  // client instead of ever reusing the cached admin one.
  setVerifyClientFactoryForTesting(() => client as unknown as SupabaseClient);
  return client;
}

test.afterEach(() => {
  setAdminDbForTesting(null);
  setVerifyClientFactoryForTesting(null);
  resetAdminDbCache();
});

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

  return { created, binding: created.binding as string, codeVerifier };
}

test('full challenge -> approve -> exchange flow issues a real session', async () => {
  useFakeDb();
  const { created, binding, codeVerifier } = await driveFullFlow();

  const pollBeforeApproval = await handleRequest(
    new Request(`https://api.hashpass.link/api/v1/auth/qr/challenges/${created.id}?state=${created.state}`, {
      headers: { [BINDING_HEADER]: binding },
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
      headers: { [BINDING_HEADER]: binding },
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
      headers: { [BINDING_HEADER]: binding },
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
      headers: { [BINDING_HEADER]: binding },
      body: exchangeBody,
    })
  );
  assert.equal(replayResponse.status, 400);
});

test('the QR URL origin matches the request that created the challenge, not a fixed default', async () => {
  useFakeDb();
  const response = await createChallengeRequest(pkcePair().codeChallenge);
  const created = await response.json();
  assert.ok(created.qrUrl.startsWith('https://api.hashpass.link/auth/'));
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
        headers: { [BINDING_HEADER]: binding },
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
        headers: { [BINDING_HEADER]: binding },
        body: exchangeBody,
      })
    );

  const [first, second] = await Promise.all([attempt(), attempt()]);
  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [200, 409]);
});

test('concurrent approve/deny attempts race safely: only the winner is reported', async () => {
  useFakeDb();
  const { created } = await driveFullFlow();

  const attempt = (decision: 'approve' | 'deny') =>
    handleRequest(
      new Request(`https://api.hashpass.link/api/v1/auth/qr/challenges/${created.id}/approve`, {
        method: 'POST',
        headers: { authorization: `Bearer ${MOBILE_USER.token}` },
        body: JSON.stringify({ decision }),
      })
    );

  const [approve, deny] = await Promise.all([attempt('approve'), attempt('deny')]);
  const results = await Promise.all([approve, deny].map((response) => response.json()));

  // Exactly one of the two concurrent decisions actually wins the
  // conditional update; the other must be told it lost (409), not silently
  // report its own decision as if it had taken effect.
  const statuses = [approve.status, deny.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  const winner = results.find((body) => body.status === 'approved' || body.status === 'denied');
  assert.ok(winner);
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
      headers: { [BINDING_HEADER]: binding },
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

test('polling with the wrong browser binding header is rejected', async () => {
  useFakeDb();
  const { created } = await driveFullFlow();

  const response = await handleRequest(
    new Request(`https://api.hashpass.link/api/v1/auth/qr/challenges/${created.id}?state=${created.state}`, {
      headers: { [BINDING_HEADER]: 'wrong-binding-value' },
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
      headers: { [BINDING_HEADER]: binding },
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
      headers: { [BINDING_HEADER]: binding },
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

test('unauthenticated qr-links list is rejected', async () => {
  useFakeDb();
  const response = await handleRequest(new Request('https://api.hashpass.link/api/v1/qr-links'));
  assert.equal(response.status, 401);
});
