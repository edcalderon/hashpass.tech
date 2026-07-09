/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

const envBackup: Record<string, string | undefined> = {};
const previousWindow = globalThis.window;

const setEnv = (name: string, value?: string) => {
  if (!(name in envBackup)) {
    envBackup[name] = process.env[name];
  }

  if (typeof value === 'string') {
    process.env[name] = value;
  } else {
    delete process.env[name];
  }
};

afterEach(() => {
  for (const [name, value] of Object.entries(envBackup)) {
    if (typeof value === 'string') {
      process.env[name] = value;
    } else {
      delete process.env[name];
    }
  }

  for (const key of Object.keys(envBackup)) {
    delete envBackup[key];
  }

  if (typeof previousWindow === 'undefined') {
    delete (globalThis as Record<string, unknown>).window;
  } else {
    (globalThis as Record<string, unknown>).window = previousWindow;
  }
});

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

  it('preserves query parameters in the callback path for native redirects', () => {
    expect(
      getSupabaseOAuthRedirectUrl({
        callbackPath: 'auth/callback?returnTo=%2Fdashboard%2Fexplore',
        platform: 'android',
      })
    ).toBe('hashpass://auth/callback?returnTo=%2Fdashboard%2Fexplore');
  });

  it('uses the web callback origin when native relay mode is requested', () => {
    expect(
      getSupabaseOAuthRedirectUrl({
        callbackPath: 'auth/callback?nativeRelay=1&returnTo=%2Fdashboard%2Fexplore',
        origin: 'https://hashpass.tech',
        platform: 'android',
        relayToNative: true,
      })
    ).toBe('https://hashpass.tech/auth/callback?nativeRelay=1&returnTo=%2Fdashboard%2Fexplore');
  });

  it('keeps localhost callbacks in local development mode', () => {
    setEnv('EXPO_PUBLIC_ENV', 'local');
    (globalThis as Record<string, unknown>).window = {
      location: {
        origin: 'http://localhost:8081',
      },
    };

    expect(getSupabaseOAuthRedirectUrl()).toBe('http://localhost:8081/auth/callback');
  });

  it('uses a hosted HTTPS browser origin even when the build env is development', () => {
    setEnv('EXPO_PUBLIC_ENV', 'local');
    (globalThis as Record<string, unknown>).window = {
      location: {
        origin: 'https://dev.hashpass.tech',
      },
    };

    expect(
      getSupabaseOAuthRedirectUrl({
        origin: 'https://dev.hashpass.tech',
      })
    ).toBe('https://dev.hashpass.tech/auth/callback');
  });

  it('does not use localhost for native relay callbacks', () => {
    setEnv('EXPO_PUBLIC_ENV', 'development');
    (globalThis as Record<string, unknown>).window = {
      location: {
        origin: 'http://localhost:8081',
      },
    };

    expect(
      getSupabaseOAuthRedirectUrl({
        callbackPath: 'auth/callback?nativeRelay=1&returnTo=%2Fdashboard%2Fexplore',
        platform: 'android',
        relayToNative: true,
      })
    ).toBe('https://hashpass.tech/auth/callback?nativeRelay=1&returnTo=%2Fdashboard%2Fexplore');
  });
});
