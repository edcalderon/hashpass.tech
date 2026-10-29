import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveProfileAvatarUrl } from './profile-avatar';

test('resolves Supabase profile photo metadata', () => {
  assert.equal(
    resolveProfileAvatarUrl({ user_metadata: { avatar_url: 'https://images.example/profile.png' } }),
    'https://images.example/profile.png',
  );
});

test('resolves Better Auth image fields and saved profile URLs', () => {
  assert.equal(resolveProfileAvatarUrl({ image: 'https://images.example/better-auth.png' }), 'https://images.example/better-auth.png');
  assert.equal(resolveProfileAvatarUrl('https://images.example/user-profile.png'), 'https://images.example/user-profile.png');
});

test('ignores non-HTTP avatar values', () => {
  assert.equal(resolveProfileAvatarUrl({ user_metadata: { image: 'data:image/png;base64,abc' } }), null);
});
