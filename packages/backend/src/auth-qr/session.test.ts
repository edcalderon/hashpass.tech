import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { issueSessionForUser } from './session';

function fakeAdminClient(overrides: { verifyOtp?: () => void } = {}) {
  let verifyOtpCalledOnAdminClient = false;

  const client = {
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { id: 'user-1', email: 'user@example.com' } }, error: null }),
        generateLink: async () => ({
          data: { properties: { verification_type: 'magiclink', hashed_token: 'token-hash-1' } },
          error: null,
        }),
      },
      verifyOtp: async () => {
        verifyOtpCalledOnAdminClient = true;
        overrides.verifyOtp?.();
        // If this ever gets hit for real, something regressed: the admin
        // client must never be the one asked to verify an OTP.
        return { data: { session: null }, error: { message: 'should not be called on the admin client' } };
      },
    },
  } as unknown as SupabaseClient;

  return { client, wasVerifyOtpCalledOnAdminClient: () => verifyOtpCalledOnAdminClient };
}

function fakeVerifyClient(session: { access_token: string; refresh_token: string } | null) {
  let verifyOtpCallCount = 0;
  const client = {
    auth: {
      verifyOtp: async () => {
        verifyOtpCallCount += 1;
        return session ? { data: { session }, error: null } : { data: { session: null }, error: { message: 'invalid' } };
      },
    },
  } as unknown as SupabaseClient;
  return { client, callCount: () => verifyOtpCallCount };
}

test('verifies the OTP on the injected verify client, never on the admin client', async () => {
  const admin = fakeAdminClient();
  const verify = fakeVerifyClient({ access_token: 'access-1', refresh_token: 'refresh-1' });

  const session = await issueSessionForUser(admin.client, 'user-1', () => verify.client);

  assert.deepEqual(session, { accessToken: 'access-1', refreshToken: 'refresh-1' });
  assert.equal(verify.callCount(), 1);
  assert.equal(admin.wasVerifyOtpCalledOnAdminClient(), false);
});

test('returns null without throwing when no verify client can be created (e.g. missing env config)', async () => {
  const admin = fakeAdminClient();

  const session = await issueSessionForUser(admin.client, 'user-1', () => null);

  assert.equal(session, null);
  assert.equal(admin.wasVerifyOtpCalledOnAdminClient(), false);
});

test('returns null when the verify client reports an incomplete session', async () => {
  const admin = fakeAdminClient();
  const verify = fakeVerifyClient(null);

  const session = await issueSessionForUser(admin.client, 'user-1', () => verify.client);

  assert.equal(session, null);
});
