/// <reference types="jest" />

import {
  buildNativePasswordlessCallbackUrl,
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

// Regression test for a PR review finding on the extractNativeRelayFragment fix
// above: resolving the fragment for callback *classification* is not enough --
// it must also reach createSessionFromUrl's token_hash/access_token parsing, or
// a native magic-link sign-in silently fails to establish a session even though
// it was correctly routed to the passwordless handler.
describe('buildNativePasswordlessCallbackUrl', () => {
  it('normalizes an iOS "#" relay fragment into "_fragment" instead of a raw "%23" query key', () => {
    const url = buildNativePasswordlessCallbackUrl(
      { '#': 'token_hash=abc123&type=magiclink', nativeRelay: '1' },
      'token_hash=abc123&type=magiclink',
    );

    expect(url).not.toContain('%23');
    expect(url).toContain('nativeRelay=1');
    expect(url).toContain(`_fragment=${encodeURIComponent('token_hash=abc123&type=magiclink')}`);
  });

  it('drops the raw Android "_fragment" param and re-emits the resolved value in its place', () => {
    const raw = 'token_hash=abc123&type=magiclink';
    const url = buildNativePasswordlessCallbackUrl(
      { _fragment: encodeURIComponent(raw), signInMethod: 'magic_link' },
      raw,
    );

    const fragmentOccurrences = url.split('_fragment=').length - 1;
    expect(fragmentOccurrences).toBe(1);
    expect(url).toContain(`_fragment=${encodeURIComponent(raw)}`);
  });

  it('omits the "_fragment" param entirely when no fragment was resolved', () => {
    const url = buildNativePasswordlessCallbackUrl({ code: 'pkce-code' }, '');

    expect(url).not.toContain('_fragment');
    expect(url).toContain('code=pkce-code');
  });
});
