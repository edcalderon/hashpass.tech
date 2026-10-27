import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeAuthError, mapAuthSession } from '../src/auth/model.ts';

test('auth model maps the Better Auth session user without retaining provider tokens', () => {
  const user = mapAuthSession({ user: { id: 'user_123', email: 'owner@example.com', name: 'Owner', image: 'https://example.com/avatar' } });

  assert.deepEqual(user, {
    id: 'user_123',
    email: 'owner@example.com',
    name: 'Owner',
    image: 'https://example.com/avatar',
  });
});

test('auth model treats missing sessions as signed out', () => {
  assert.equal(mapAuthSession(null), null);
  assert.equal(mapAuthSession({ session: { id: 'session_123' } }), null);
});

test('auth errors have a safe user-facing fallback', () => {
  assert.equal(describeAuthError(new Error('API unavailable')), 'API unavailable');
  assert.match(describeAuthError({}), /could not verify/i);
});
