/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

jest.mock('@hashpass/config', () => ({
  ENV_CONFIG: {
    getTenant: jest.fn(() => ({ slug: 'main', authProvider: 'directus' })),
    getApiUrl: jest.fn(() => 'https://api.hashpass.tech/api'),
    getSSOUrl: jest.fn(() => 'https://sso.hashpass.co'),
  },
}));

jest.mock('better-auth/client', () => ({
  createAuthClient: jest.fn(() => ({
    signIn: { social: jest.fn() },
    signOut: jest.fn(),
    getSession: jest.fn(),
  })),
}));

const mockSupabaseProviderInstance = {
  getProviderName: jest.fn(() => 'supabase'),
  signInWithOAuth: jest.fn(async () => ({
    pending: true,
    oauthUrl: 'https://example.supabase.co/oauth/authorize',
  })),
  signInWithEmailAndPassword: jest.fn(),
  handleOAuthCallback: jest.fn(),
  signOut: jest.fn(),
  getSession: jest.fn(),
  refreshSession: jest.fn(),
  isAuthenticated: jest.fn(() => false),
  getUser: jest.fn(() => null),
  onAuthStateChange: jest.fn(() => () => {}),
};

const mockSupabaseProviderCtor = jest.fn(() => mockSupabaseProviderInstance as any);

jest.mock('../../../../packages/auth/src/providers/supabase', () => ({
  SupabaseAuthProvider: mockSupabaseProviderCtor,
}));

jest.mock('../../../../packages/auth/src/providers/directus', () => ({
  DirectusAuthProvider: jest.fn(),
}));

jest.mock('../../../../packages/auth/src/providers/better-auth', () => ({
  BetterAuthProvider: jest.fn(),
}));

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

beforeEach(() => {
  jest.resetModules();
  mockSupabaseProviderCtor.mockClear();
  mockSupabaseProviderInstance.getProviderName.mockClear();
  mockSupabaseProviderInstance.signInWithOAuth.mockClear();
  setEnv('AUTH_PROVIDER', undefined);
  setEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  setEnv('EXPO_PUBLIC_SUPABASE_KEY', 'anon-key');
  setEnv('EXPO_PUBLIC_SUPABASE_PROFILE', 'core-production');
});

afterEach(() => {
  restoreEnv();
});

describe('native auth provider fallback', () => {
  it('prefers Supabase on native when public Supabase credentials exist', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createAuthProviderFromEnv } = require('../../../../packages/auth/src/factory');

    const provider = createAuthProviderFromEnv();

    expect(provider.getProviderName()).toBe('supabase');
    expect(mockSupabaseProviderCtor).toHaveBeenCalledWith('https://example.supabase.co', 'anon-key', undefined);

    const result = await provider.signInWithOAuth('google');

    expect(result).toEqual({
      pending: true,
      oauthUrl: 'https://example.supabase.co/oauth/authorize',
    });
    expect(mockSupabaseProviderInstance.signInWithOAuth).toHaveBeenCalledWith('google');
  });
});
