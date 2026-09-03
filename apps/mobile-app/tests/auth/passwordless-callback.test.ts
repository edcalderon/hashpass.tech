/// <reference types="jest" />

import {
  extractNativeRelayFragment,
  isBetterAuthGoogleCallback,
  isSupabasePasswordlessCallback,
} from '../../lib/auth/passwordless-callback';

describe('isSupabasePasswordlessCallback', () => {
  it('keeps a magic-link callback out of Better Auth when a stale Google marker remains', () => {
    expect(
      isSupabasePasswordlessCallback({
        signInMethod: 'google_oauth',
        passwordlessRequestInProgress: true,
      }),
    ).toBe(true);
  });

  it.each([
    { code: 'pkce-code' },
    { tokenHash: 'token-hash' },
    { token: 'email-token', email: 'user@example.com' },
    { hasImplicitAccessToken: true },
  ])('recognizes a Supabase callback payload %#', (params) => {
    expect(isSupabasePasswordlessCallback(params)).toBe(true);
  });

  it('does not misroute a normal Google callback', () => {
    expect(isSupabasePasswordlessCallback({ signInMethod: 'google_oauth' })).toBe(false);
  });

  it('requires Better Auth\'s active OAuth marker before choosing its cookie callback', () => {
    expect(isBetterAuthGoogleCallback({ signInMethod: 'google_oauth', oauthInProgress: true })).toBe(true);
    expect(isBetterAuthGoogleCallback({ signInMethod: 'google_oauth', oauthInProgress: false })).toBe(false);
    expect(isBetterAuthGoogleCallback({ signInMethod: 'google_oauth' })).toBe(false);
    expect(isBetterAuthGoogleCallback({ signInMethod: 'magic_link', oauthInProgress: true })).toBe(false);
  });
});

// Regression test for a PR review finding: a magic link requested inside the
// native app forwards its hash fragment as Expo Router's params['#'] on iOS
// or params._fragment on Android (see getNativeRelayUrl in callback.tsx).
// Without resolving these, a native magic-link callback never recovers its
// token_hash/access_token and falls through to the generic OAuth handler.
describe('extractNativeRelayFragment', () => {
  it('prefers the iOS-style "#" param when present', () => {
    expect(
      extractNativeRelayFragment({ '#': 'token_hash=abc123&type=magiclink' }),
    ).toBe('token_hash=abc123&type=magiclink');
  });

  it('decodes the Android-style _fragment param', () => {
    const raw = 'token_hash=abc123&type=magiclink';
    expect(
      extractNativeRelayFragment({ _fragment: encodeURIComponent(raw) }),
    ).toBe(raw);
  });

  it('falls back to the raw _fragment value if it is not URI-encoded', () => {
    expect(
      extractNativeRelayFragment({ _fragment: 'not%a-valid%encoding' }),
    ).toBe('not%a-valid%encoding');
  });

  it('takes the first entry when Expo Router hands back an array', () => {
    expect(extractNativeRelayFragment({ '#': ['token_hash=abc123', 'ignored'] })).toBe(
      'token_hash=abc123',
    );
  });

  it('returns an empty string when neither native representation is present', () => {
    expect(extractNativeRelayFragment({})).toBe('');
  });
});
