/// <reference types="jest" />

import { describe, expect, it, afterEach } from '@jest/globals';
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
  it('forces Better Auth for bsl.hashpass.tech even when AUTH_PROVIDER is set to directus', () => {
    setEnv('AUTH_PROVIDER', 'directus');
    setEnv('EXPO_PUBLIC_BETTER_AUTH_URL', 'https://bsl.hashpass.tech/api/bsl-auth');
    setEnv('EXPO_PUBLIC_BETTER_AUTH_BASE_PATH', '/api/bsl-auth');
    setEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://core-project.supabase.co');
    setEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-core');

    const config = resolveAuthProviderConfig({ hostname: 'bsl.hashpass.tech' });

    expect(config.provider).toBe('better-auth');
    expect(config.betterAuth?.baseURL).toBe('https://bsl.hashpass.tech/api/bsl-auth');
    expect(config.betterAuth?.basePath).toBe('/api/bsl-auth');
  });

  it('keeps hashpass.tech on Directus by default', () => {
    delete process.env.AUTH_PROVIDER;
    setEnv('EXPO_PUBLIC_SUPABASE_URL_PROD', 'https://core-project.supabase.co');
    setEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'anon-core');

    const config = resolveAuthProviderConfig({ hostname: 'hashpass.tech' });

    expect(config.provider).toBe('directus');
  });
});
