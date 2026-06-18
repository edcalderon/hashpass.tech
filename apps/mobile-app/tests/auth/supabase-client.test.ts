/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

jest.mock('expo-auth-session/build/QueryParams', () => ({
  __esModule: true,
  getQueryParams: jest.fn(() => ({
    params: {},
    errorCode: null,
  })),
}), { virtual: true });

const mockCreateClient = jest.fn(() => ({
  auth: {
    getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
    onAuthStateChange: jest.fn(() => ({
      data: {
        subscription: {
          unsubscribe: jest.fn(),
        },
      },
    })),
    setSession: jest.fn(),
    exchangeCodeForSession: jest.fn(),
    verifyOtp: jest.fn(),
    signInWithOtp: jest.fn(),
    signInWithOAuth: jest.fn(),
    signInWithPassword: jest.fn(),
    refreshSession: jest.fn(),
    signOut: jest.fn(),
    updateUser: jest.fn(),
  },
  from: jest.fn(),
  rpc: jest.fn(),
  channel: jest.fn(() => ({})),
  removeChannel: jest.fn(),
  removeAllChannels: jest.fn(() => []),
  storage: {
    from: jest.fn(),
  },
}));

jest.mock('@supabase/supabase-js', () => ({
  __esModule: true,
  createClient: mockCreateClient,
}));

/* eslint-disable @typescript-eslint/no-require-imports */

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
  mockCreateClient.mockClear();
  setEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  setEnv('EXPO_PUBLIC_SUPABASE_KEY', 'anon-key');
});

afterEach(() => {
  restoreEnv();
});

describe('web Supabase client initialization', () => {
  it('disables detectSessionInUrl on web and keeps auth callback handling manual', () => {
    // Import after env setup so the module initializes with the mocked client.
    require('../../lib/supabase');

    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        }),
      })
    );
  });

  it('falls back to the browser runtime profile map when generic env vars are absent', () => {
    setEnv('EXPO_PUBLIC_SUPABASE_URL', undefined);
    setEnv('EXPO_PUBLIC_SUPABASE_KEY', undefined);
    setEnv('EXPO_PUBLIC_SUPABASE_URL_PROD', undefined);
    setEnv('EXPO_PUBLIC_SUPABASE_KEY_PROD', undefined);
    setEnv('EXPO_PUBLIC_BSL_SUPABASE_URL_PROD', undefined);
    setEnv('EXPO_PUBLIC_BSL_SUPABASE_KEY_PROD', undefined);
    setEnv('EXPO_PUBLIC_SUPABASE_PROFILE', 'bsl-production');
    setEnv('SUPABASE_PROFILE', 'bsl-production');

    const globalAny = globalThis as Record<string, unknown>;
    const previousRuntime = globalAny.__HASHPASS_RUNTIME__;

    try {
      globalAny.__HASHPASS_RUNTIME__ = {
        supabaseProfiles: {
          'bsl-production': {
            supabaseUrl: 'https://runtime-bsl.supabase.co',
            supabaseAnonKey: 'runtime-bsl-key',
          },
        },
      };

      // Import after runtime setup so the module initializes with the mocked client.
      require('../../lib/supabase');

      expect(mockCreateClient).toHaveBeenCalledTimes(1);
      expect(mockCreateClient).toHaveBeenCalledWith(
        'https://runtime-bsl.supabase.co',
        'runtime-bsl-key',
        expect.objectContaining({
          auth: expect.objectContaining({
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
          }),
        })
      );
    } finally {
      if (typeof previousRuntime === 'undefined') {
        delete globalAny.__HASHPASS_RUNTIME__;
      } else {
        globalAny.__HASHPASS_RUNTIME__ = previousRuntime;
      }
    }
  });

  it('exchanges an OAuth code returned in the callback URL for a session', async () => {
    const queryParams = require('expo-auth-session/build/QueryParams');
    queryParams.getQueryParams.mockReturnValueOnce({
      params: { code: 'oauth-code-123' },
      errorCode: null,
    });

    require('../../lib/supabase');
    const { createSessionFromUrl } = require('../../lib/supabase');

    const clientInstance = mockCreateClient.mock.results[0]?.value as {
      auth: {
        exchangeCodeForSession: jest.Mock;
      };
    };

    clientInstance.auth.exchangeCodeForSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id: 'user-123',
            email: 'user@example.com',
            role: 'authenticated',
            user_metadata: {},
            app_metadata: {},
            aud: 'authenticated',
            confirmation_sent_at: null,
            confirmed_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            phone: null,
            phone_confirmed_at: null,
            email_confirmed_at: null,
            last_sign_in_at: new Date().toISOString(),
          },
        },
      },
      error: null,
    });

    const result = await createSessionFromUrl('hashpass://auth/callback?code=oauth-code-123');

    expect(clientInstance.auth.exchangeCodeForSession).toHaveBeenCalledWith('oauth-code-123');
    expect(result.error).toBeNull();
    expect(result.session?.access_token).toBe('access-token');
    expect(result.session?.user.email).toBe('user@example.com');
  });
});
