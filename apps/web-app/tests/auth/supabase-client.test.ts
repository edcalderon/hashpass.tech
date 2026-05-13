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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
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
});
