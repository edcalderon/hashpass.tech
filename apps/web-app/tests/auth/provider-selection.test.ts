/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

jest.mock('better-auth/client', () => ({
  createAuthClient: jest.fn(() => ({
    signIn: { social: jest.fn() },
    signOut: jest.fn(),
    getSession: jest.fn(),
  })),
}));

import { resolveAuthProviderConfig } from '../../../../packages/auth/src/factory';

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

afterEach(() => {
  restoreEnv();
});

describe('resolveAuthProviderConfig', () => {
  it.each([
    ['bsl.hashpass.tech', 'https://api.hashpass.tech/api/auth'],
    ['bsl-dev.hashpass.tech', 'https://api-dev.hashpass.tech/api/auth'],
    ['bsl2025.hashpass.tech', 'https://api.hashpass.tech/api/auth'],
    ['blockchainsummit.hashpass.lat', 'https://api.hashpass.tech/api/auth'],
  ])('forces Better Auth for %s even when AUTH_PROVIDER is set to directus', (hostname, expectedBaseURL) => {
    setEnv('AUTH_PROVIDER', 'directus');
    setEnv('EXPO_PUBLIC_BETTER_AUTH_URL', 'https://api.hashpass.tech/api/auth');
    setEnv('EXPO_PUBLIC_BETTER_AUTH_BASE_PATH', '/api/auth');
    setEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://core-project.supabase.co');
    setEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-core');

    const config = resolveAuthProviderConfig({ hostname });

    expect(config.provider).toBe('better-auth');
    expect(config.betterAuth?.baseURL).toBe(expectedBaseURL);
    expect(config.betterAuth?.basePath).toBe('/api/auth');
  });

  it.each([
    ['bsl.hashpass.tech', 'https://api.hashpass.tech/api/auth'],
    ['bsl-dev.hashpass.tech', 'https://api-dev.hashpass.tech/api/auth'],
  ])('derives Better Auth from tenant config for %s', (hostname, expectedBaseURL) => {
    delete process.env.AUTH_PROVIDER;
    setEnv('EXPO_PUBLIC_BETTER_AUTH_URL', undefined);
    setEnv('BETTER_AUTH_URL', undefined);
    setEnv('EXPO_PUBLIC_API_BASE_URL', undefined);
    setEnv('NEXT_PUBLIC_API_BASE_URL', undefined);

    const config = resolveAuthProviderConfig({ hostname });

    expect(config.provider).toBe('better-auth');
    expect(config.betterAuth?.baseURL).toBe(expectedBaseURL);
    expect(config.betterAuth?.basePath).toBe('/api/auth');
  });

  it('keeps hashpass.tech on Directus by default', () => {
    delete process.env.AUTH_PROVIDER;
    setEnv('EXPO_PUBLIC_SUPABASE_URL_PROD', 'https://core-project.supabase.co');
    setEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'anon-core');

    const config = resolveAuthProviderConfig({ hostname: 'hashpass.tech' });

    expect(config.provider).toBe('directus');
  });
});
