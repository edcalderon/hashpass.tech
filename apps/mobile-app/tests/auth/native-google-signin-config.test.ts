/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

const envBackup: Record<string, string | undefined> = {};

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

const restoreEnv = () => {
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
};

const loadHelper = (platformOs: 'android' | 'ios' | 'web') => {
  jest.doMock('react-native', () => ({
    Platform: { OS: platformOs },
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { shouldUseNativeGoogleSignin } = require('../../lib/native-google-signin-config');
  return shouldUseNativeGoogleSignin as (webClientId?: string | null) => boolean;
};

describe('shouldUseNativeGoogleSignin', () => {
  beforeEach(() => {
    jest.resetModules();
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', undefined);
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', undefined);
    setEnv('GOOGLE_CLIENT_ID', undefined);
    setEnv('BETTER_AUTH_GOOGLE_CLIENT_ID', undefined);
  });

  afterEach(() => {
    restoreEnv();
    jest.dontMock('react-native');
  });

  it('defaults to enabled on native when a web client id exists', () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');

    const shouldUseNativeGoogleSignin = loadHelper('android');
    expect(shouldUseNativeGoogleSignin(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)).toBe(true);
  });

  it('defaults to enabled on native when only the shared GOOGLE_CLIENT_ID exists', () => {
    setEnv('GOOGLE_CLIENT_ID', 'shared-google-client-id');

    const shouldUseNativeGoogleSignin = loadHelper('android');
    expect(shouldUseNativeGoogleSignin(undefined)).toBe(true);
  });

  it('defaults to enabled on native when only the Better Auth Google client id exists', () => {
    setEnv('BETTER_AUTH_GOOGLE_CLIENT_ID', 'better-auth-google-client-id');

    const shouldUseNativeGoogleSignin = loadHelper('android');
    expect(shouldUseNativeGoogleSignin()).toBe(true);
  });

  it('can be disabled explicitly on native builds', () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', 'false');

    const shouldUseNativeGoogleSignin = loadHelper('android');
    expect(shouldUseNativeGoogleSignin(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)).toBe(false);
  });

  it('treats an explicit true flag as an enabled native release', () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', 'true');

    const shouldUseNativeGoogleSignin = loadHelper('android');
    expect(shouldUseNativeGoogleSignin(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)).toBe(true);
  });

  it('treats a blank native flag as unset', () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', '   ');

    const shouldUseNativeGoogleSignin = loadHelper('android');
    expect(shouldUseNativeGoogleSignin(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)).toBe(true);
  });

  it('ignores unrecognized native flag values and keeps native sign-in enabled', () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', 'maybe');

    const shouldUseNativeGoogleSignin = loadHelper('android');
    expect(shouldUseNativeGoogleSignin(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)).toBe(true);
  });

  it('returns false when no Google client id can be resolved', () => {
    const shouldUseNativeGoogleSignin = loadHelper('android');
    expect(shouldUseNativeGoogleSignin()).toBe(false);
  });

  it('stays disabled on web', () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');

    const shouldUseNativeGoogleSignin = loadHelper('web');
    expect(shouldUseNativeGoogleSignin(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)).toBe(false);
  });
});
