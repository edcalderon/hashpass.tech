/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

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
    signInWithOAuth: jest.fn(),
    signInWithPassword: jest.fn(),
    signOut: jest.fn(),
    refreshSession: jest.fn(),
    getUser: jest.fn(),
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

const createSession = (overrides: Partial<Record<string, unknown>> = {}) => ({
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
  ...overrides,
});

describe('SupabaseAuthProvider', () => {
  beforeEach(() => {
    jest.resetModules();
    mockCreateClient.mockClear();
  });

  it('exchanges the OAuth code on web when Supabase has not auto-detected the session', async () => {
    const { SupabaseAuthProvider } = require('../../../../packages/auth/src/providers/supabase');

    const provider = new SupabaseAuthProvider('https://example.supabase.co', 'anon-key');
    const clientInstance = mockCreateClient.mock.results[0]?.value as {
      auth: {
        exchangeCodeForSession: jest.Mock;
      };
    };

    clientInstance.auth.exchangeCodeForSession.mockResolvedValueOnce({
      data: {
        session: createSession(),
      },
      error: null,
    });

    const result = await provider.handleOAuthCallback({ code: 'oauth-code-123' });

    expect(clientInstance.auth.exchangeCodeForSession).toHaveBeenCalledWith('oauth-code-123');
    expect(result.error).toBeUndefined();
    expect(result.session?.user.email).toBe('user@example.com');
  });

  it('verifies token_hash email links during callback handling', async () => {
    const { SupabaseAuthProvider } = require('../../../../packages/auth/src/providers/supabase');

    const provider = new SupabaseAuthProvider('https://example.supabase.co', 'anon-key');
    const clientInstance = mockCreateClient.mock.results[0]?.value as {
      auth: {
        verifyOtp: jest.Mock;
      };
    };

    clientInstance.auth.verifyOtp.mockResolvedValueOnce({
      data: {
        session: createSession({ user: { ...createSession().user, email: 'magic@example.com' } }),
      },
      error: null,
    });

    const result = await provider.handleOAuthCallback({
      token_hash: 'magic-hash-123',
      type: 'magiclink',
    });

    expect(clientInstance.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'magic-hash-123',
      type: 'magiclink',
    });
    expect(result.error).toBeUndefined();
    expect(result.session?.user.email).toBe('magic@example.com');
  });
});
