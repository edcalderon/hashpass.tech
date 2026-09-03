/// <reference types="jest" />

import {
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
    expect(isBetterAuthGoogleCallback({ signInMethod: 'magic_link', oauthInProgress: true })).toBe(false);
  });
});
