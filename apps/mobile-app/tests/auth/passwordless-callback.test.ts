/// <reference types="jest" />

import {
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
});
