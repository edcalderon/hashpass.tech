import { resolveAvatarUrl } from '../../lib/auth/avatar';

describe('resolveAvatarUrl', () => {
  it('prefers the Supabase metadata photo when it is available', () => {
    expect(resolveAvatarUrl(
      { user_metadata: { avatar_url: 'https://supabase.example/avatar.jpg' } },
      { image: 'https://better-auth.example/image.jpg' },
    )).toBe('https://supabase.example/avatar.jpg');
  });

  it('resolves Better Auth social images', () => {
    expect(resolveAvatarUrl({ image: 'https://x.example/profile.jpg' })).toBe(
      'https://x.example/profile.jpg',
    );
  });

  it('ignores non-remote values and supports legacy avatar URLs', () => {
    expect(resolveAvatarUrl(
      { user_metadata: { image: 'data:image/png;base64,invalid' }, avatar: 'https://legacy.example/avatar.png' },
    )).toBe('https://legacy.example/avatar.png');
    expect(resolveAvatarUrl({ user_metadata: { picture: 'not-a-url' } })).toBeNull();
  });
});
