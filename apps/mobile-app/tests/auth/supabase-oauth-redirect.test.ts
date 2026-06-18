/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

import {
  getSupabaseOAuthRedirectUrl,
  SUPABASE_OAUTH_CALLBACK_PATH,
  SUPABASE_OAUTH_NATIVE_SCHEME,
} from '../../../../packages/auth/src/supabase-oauth';

describe('getSupabaseOAuthRedirectUrl', () => {
  it('builds the web callback URL from the provided origin', () => {
    expect(
      getSupabaseOAuthRedirectUrl({
        origin: 'https://hashpass.tech',
      })
    ).toBe('https://hashpass.tech/auth/callback');
  });

  it('builds the native callback URL from the app scheme', () => {
    expect(
      getSupabaseOAuthRedirectUrl({
        platform: 'android',
      })
    ).toBe(`${SUPABASE_OAUTH_NATIVE_SCHEME}://${SUPABASE_OAUTH_CALLBACK_PATH.slice(1)}`);
  });

  it('normalizes custom callback paths and schemes', () => {
    expect(
      getSupabaseOAuthRedirectUrl({
        callbackPath: 'auth/callback',
        platform: 'ios',
        scheme: 'hashpass',
      })
    ).toBe('hashpass://auth/callback');
  });
});
