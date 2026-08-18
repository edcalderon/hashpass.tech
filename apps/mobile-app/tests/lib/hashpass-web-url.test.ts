/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

jest.mock('../../lib/event-detector', () => ({
  getCurrentEvent: jest.fn(() => null),
}));

jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn(async () => ({ data: { session: null }, error: null })) } },
}));

jest.mock('@hashpass/auth', () => ({
  authService: { getSession: jest.fn(), getApiAccessToken: jest.fn() },
}));

import { Platform } from 'react-native';
import { getHashpassWebOrigin } from '../../lib/hashpass-web-url';

const envBackup: Record<string, string | undefined> = {};
const originalPlatformOs = Platform.OS;

const setEnv = (name: string, value?: string) => {
  if (!(name in envBackup)) envBackup[name] = process.env[name];
  if (typeof value === 'string') process.env[name] = value;
  else delete process.env[name];
};

const setWindow = (value?: any) => {
  if (typeof value === 'undefined') {
    delete (global as typeof globalThis & { window?: any }).window;
    return;
  }
  (global as typeof globalThis & { window?: any }).window = value;
};

beforeEach(() => {
  Platform.OS = 'android';
  setWindow(undefined);
  setEnv('EXPO_PUBLIC_EAS_BUILD_PROFILE', undefined);
  setEnv('EXPO_PUBLIC_SUPABASE_PROFILE', undefined);
});

afterEach(() => {
  for (const [name, value] of Object.entries(envBackup)) {
    if (typeof value === 'string') process.env[name] = value;
    else delete process.env[name];
  }
  for (const key of Object.keys(envBackup)) delete envBackup[key];
  Platform.OS = originalPlatformOs;
  setWindow(undefined);
});

describe('getHashpassWebOrigin', () => {
  // The delete-account disclaimer modal (app/(shared)/dashboard/settings.tsx)
  // used to hardcode https://hashpass.tech/terms and /privacy regardless of
  // which environment the app was actually running against -- this is the
  // helper that fixes that, mirroring api-client.ts's own build-environment
  // detection already used for the API base URL.
  it('uses window.location.origin directly on web, regardless of build profile', () => {
    Platform.OS = 'web';
    setEnv('EXPO_PUBLIC_SUPABASE_PROFILE', 'core-production');
    setWindow({ location: { origin: 'https://dev.hashpass.tech' } });

    expect(getHashpassWebOrigin()).toBe('https://dev.hashpass.tech');
  });

  it('uses window.location.origin on localhost during local web development', () => {
    Platform.OS = 'web';
    setWindow({ location: { origin: 'http://localhost:8081' } });

    expect(getHashpassWebOrigin()).toBe('http://localhost:8081');
  });

  it('falls back to dev.hashpass.tech on native when the build profile is development', () => {
    Platform.OS = 'android';
    setEnv('EXPO_PUBLIC_SUPABASE_PROFILE', 'core-development');

    expect(getHashpassWebOrigin()).toBe('https://dev.hashpass.tech');
  });

  it('falls back to hashpass.tech on native when the build profile is production', () => {
    Platform.OS = 'ios';
    setEnv('EXPO_PUBLIC_SUPABASE_PROFILE', 'core-production');

    expect(getHashpassWebOrigin()).toBe('https://hashpass.tech');
  });

  it('defaults to production when no build profile signal is present at all', () => {
    Platform.OS = 'android';

    expect(getHashpassWebOrigin()).toBe('https://hashpass.tech');
  });
});
