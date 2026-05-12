/// <reference types="jest" />

import { resolveAuthProviderConfig } from '../../../../packages/auth/src/factory';

const envBackup: Record<string, string | undefined> = {};
const windowBackup: Record<string, unknown> = {};
let createdWindow = false;

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

const setWindowValue = (name: string, value?: string) => {
  const browserWindow = ensureWindow();

  if (!(name in windowBackup)) {
    windowBackup[name] = browserWindow[name];
  }

  if (typeof value === 'string') {
    browserWindow[name] = value;
  } else {
    delete browserWindow[name];
  }
};

const ensureWindow = (): Record<string, unknown> => {
  if (typeof globalThis.window === 'undefined') {
    createdWindow = true;
    (globalThis as any).window = {} as Record<string, unknown>;
  }

  return globalThis.window as unknown as Record<string, unknown>;
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

const restoreWindow = () => {
  const browserWindow = globalThis.window as unknown as Record<string, unknown> | undefined;
  if (!browserWindow) return;

  for (const [name, value] of Object.entries(windowBackup)) {
    if (typeof value === 'undefined') {
      delete browserWindow[name];
    } else {
      browserWindow[name] = value;
    }
  }

  for (const key of Object.keys(windowBackup)) {
    delete windowBackup[key];
  }

  if (createdWindow) {
    delete (globalThis as any).window;
    createdWindow = false;
  }
};

afterEach(() => {
  restoreEnv();
  restoreWindow();
});

describe('resolveAuthProviderConfig', () => {
  it.each([
    'bsl.hashpass.tech',
    'bsl-dev.hashpass.tech',
    'bsl2025.hashpass.tech',
    'blockchainsummit.hashpass.lat',
  ])('forces Better Auth for %s even when AUTH_PROVIDER is set to directus', (hostname) => {
    setEnv('AUTH_PROVIDER', 'directus');
    setEnv('EXPO_PUBLIC_BETTER_AUTH_URL', 'https://api.hashpass.tech/api/auth');
    setEnv('EXPO_PUBLIC_BETTER_AUTH_BASE_PATH', '/api/auth');
    setEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://core-project.supabase.co');
    setEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-core');

    const config = resolveAuthProviderConfig({ hostname });

    expect(config.provider).toBe('better-auth');
    expect(config.betterAuth?.baseURL).toBe('https://api.hashpass.tech/api/auth');
    expect(config.betterAuth?.basePath).toBe('/api/auth');
  });

  it('falls back to the runtime API base URL when the build-time Better Auth URL is missing', () => {
    delete process.env.AUTH_PROVIDER;
    setEnv('EXPO_PUBLIC_BETTER_AUTH_URL', undefined);
    setEnv('BETTER_AUTH_URL', undefined);
    setEnv('EXPO_PUBLIC_API_BASE_URL', undefined);
    setEnv('NEXT_PUBLIC_API_BASE_URL', undefined);
    setWindowValue('__API_BASE_URL__', 'https://api.hashpass.tech/api');

    const config = resolveAuthProviderConfig({ hostname: 'bsl.hashpass.tech' });

    expect(config.provider).toBe('better-auth');
    expect(config.betterAuth?.baseURL).toBe('https://api.hashpass.tech/api/auth');
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
