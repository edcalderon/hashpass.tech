import { normalizeMagicLinkRedirect } from '../../../lib/auth/magic-link-request';

describe('normalizeMagicLinkRedirect', () => {
  it('accepts the exact production callback URL', () => {
    expect(normalizeMagicLinkRedirect('https://hashpass.tech/auth/callback')).toBe(
      'https://hashpass.tech/auth/callback',
    );
  });

  it('accepts the native relay only with a relative post-login path', () => {
    expect(
      normalizeMagicLinkRedirect(
        'https://hashpass.tech/auth/callback?returnTo=%2Fvault&nativeRelay=1',
      ),
    ).toBe('https://hashpass.tech/auth/callback?returnTo=%2Fvault&nativeRelay=1');
  });

  it.each([
    'not-a-url',
    'https://hashpass.tech/auth/callback/',
    'https://hashpass.tech/auth/other',
    'https://evil.example/auth/callback',
    'http://hashpass.tech/auth/callback',
    'https://hashpass.tech/auth/callback?returnTo=https%3A%2F%2Fevil.example&nativeRelay=1',
    'https://hashpass.tech/auth/callback?anything=1',
  ])('rejects unsafe callback target %s', (target) => {
    expect(normalizeMagicLinkRedirect(target)).toBeNull();
  });
});
