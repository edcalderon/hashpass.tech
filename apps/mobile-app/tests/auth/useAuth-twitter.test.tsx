/// <reference types="jest" />
/**
 * X (Twitter) sign-in in `useAuth.ts`:
 *
 *   - web:   route `twitter` through Better Auth's social redirect flow.
 *   - native (android/ios): run Better Auth's system browser session (X has
 *     no ID-token SDK) and apply the resulting session.
 */

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

const mockAuthService = {
  signInWithOAuth: jest.fn(async () => ({ pending: true })),
  handleOAuthCallback: jest.fn(async () => ({ pending: true })),
  getProviderName: jest.fn(() => 'better-auth'),
  isAuthenticated: jest.fn(() => false),
  signOut: jest.fn(async () => undefined),
  getSession: jest.fn(async () => null),
  onAuthStateChange: jest.fn(() => () => {}),
};

const mockBetterAuthSignInWithOAuth = jest.fn(async () => ({ pending: true }));
const mockBetterAuthHandleOAuthCallback = jest.fn(async (): Promise<any> => ({ pending: true }));
const MockBetterAuthProvider = jest.fn().mockImplementation(() => ({
  onAuthStateChange: jest.fn(() => () => {}),
  getSession: jest.fn(async () => null),
  signOut: jest.fn(async () => undefined),
  signInWithOAuth: mockBetterAuthSignInWithOAuth,
  handleOAuthCallback: mockBetterAuthHandleOAuthCallback,
}));

const mockSupabase = {
  auth: {
    onAuthStateChange: jest.fn(() => ({
      data: { subscription: { unsubscribe: jest.fn() } },
    })),
    getSession: jest.fn(async () => ({ data: { session: null } })),
    signInWithOAuth: jest.fn(),
    signInWithIdToken: jest.fn(),
    signOut: jest.fn(),
    setSession: jest.fn(),
    verifyOtp: jest.fn(),
  },
};

let lastAct: any = null;
let lastRenderer: any = null;

const mountUseAuth = (platform: string) => {
  let captured: any = null;
  let testAct: any = null;

  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({ Platform: { OS: platform } }));
    jest.doMock('@hashpass/auth', () => ({
      authService: mockAuthService,
      BetterAuthProvider: MockBetterAuthProvider,
      getSupabaseOAuthRedirectUrl: jest.fn(() => 'http://localhost:8081/auth/callback'),
    }));
    jest.doMock('@hashpass/auth/auth-dependencies', () => ({
      configureAuthService: jest.fn(),
    }));
    jest.doMock('../../lib/supabase', () => ({
      supabase: mockSupabase,
      createSessionFromUrl: jest.fn(),
      clearPersistedSupabaseSession: jest.fn(),
    }));
    jest.doMock('../../config/supabase-profiles', () => ({
      resolvePublicSupabaseConfig: jest.fn(() => ({
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'anon-key',
      })),
    }));
    jest.doMock('../../lib/native-google-signin', () => ({
      clearNativeGoogleAccount: jest.fn(),
      nativeGoogleSigninStatusCodes: {
        SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
        PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
      },
      signInWithNativeGoogleAccount: jest.fn(),
    }));
    jest.doMock('../../lib/auth/oauth/callback-params', () => ({
      mergeOAuthParams: jest.fn((params: URLSearchParams, extras: Record<string, string>) => ({
        ...Object.fromEntries(params.entries()),
        ...extras,
      })),
    }));
    jest.doMock('expo-web-browser', () => ({
      __esModule: true,
      openAuthSessionAsync: jest.fn(),
    }));

    const React = require('react');
    const TestRenderer = require('react-test-renderer');
    const { useAuth } = require('../../hooks/useAuth');
    testAct = TestRenderer.act;

    const Harness = () => {
      captured = useAuth();
      return null;
    };
    TestRenderer.act(() => {
      lastRenderer = TestRenderer.create(React.createElement(Harness));
    });
  });

  lastAct = testAct;
  return { captured, testAct };
};

// The hook starts fire-and-forget work (Supabase bridge, auth-state listeners)
// after a successful sign-in. Drain it inside act() so its state updates don't
// land after the test ends, which Jest reports as a failed run.
const flushAsyncWork = async (testAct: any) => {
  await testAct(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe('useAuth X (Twitter) sign-in', () => {
  afterEach(async () => {
    if (lastAct) await flushAsyncWork(lastAct);
    // Unmount so the hook's timers/listeners can't update state after the file ends.
    if (lastRenderer && lastAct) lastAct(() => lastRenderer.unmount());
    lastAct = null;
    lastRenderer = null;
  });

  beforeEach(() => {
    jest.resetModules();
    mockAuthService.signInWithOAuth.mockClear();
    mockAuthService.handleOAuthCallback.mockClear();
    mockBetterAuthSignInWithOAuth.mockClear();
    mockBetterAuthHandleOAuthCallback.mockClear();
    MockBetterAuthProvider.mockClear();
    mockSupabase.auth.signInWithOAuth.mockClear();
  });

  it('routes web Twitter sign-in through Better Auth', async () => {
    const { captured, testAct } = mountUseAuth('web');

    let result: any;
    await testAct(async () => {
      result = await captured.signInWithOAuth('twitter');
    });

    expect(result).toEqual({ pending: true });
    // Web routing always goes through Better Auth (not Supabase OAuth).
    // With `providerName === 'better-auth'`, useAuth uses `authService`
    // directly; otherwise it uses the lazy social Better Auth provider.
    expect(mockAuthService.signInWithOAuth).toHaveBeenCalledWith('twitter');
    // Twitter must NOT fall through to the Supabase OAuth path, nor to the
    // native Google/Apple flows — it is a pure Better Auth social provider.
    expect(mockSupabase.auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(mockBetterAuthSignInWithOAuth).not.toHaveBeenCalled();
  });

  it('routes a completed web X callback through Better Auth, not the tenant primary provider', async () => {
    const originalWindow = global.window;
    const localStorage = {
      getItem: jest.fn((key: string) => {
        if (key === 'auth_signin_method') return 'twitter_oauth';
        if (key === 'oauth_in_progress') return 'true';
        return null;
      }),
    };
    Object.defineProperty(global, 'window', {
      configurable: true,
      value: { localStorage },
    });
    mockAuthService.getProviderName.mockReturnValue('directus');
    const completedSession = {
      user: { id: 'ba-user', email: 'x@example.com' },
      access_token: 'token',
      provider: 'better-auth',
    };
    mockBetterAuthHandleOAuthCallback.mockResolvedValueOnce({
      user: completedSession.user,
      session: completedSession,
    });

    try {
      const { captured, testAct } = mountUseAuth('web');

      let result: any;
      await testAct(async () => {
        result = await captured.handleOAuthCallback({});
      });

      expect(result.session).toEqual(completedSession);
      expect(mockBetterAuthHandleOAuthCallback).toHaveBeenCalledWith({}, undefined);
      expect(mockAuthService.handleOAuthCallback).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(global, 'window', {
        configurable: true,
        value: originalWindow,
      });
      mockAuthService.getProviderName.mockReturnValue('better-auth');
    }
  });

  describe.each(['android', 'ios'])('native (%s)', (platform) => {
    const nativeSession = {
      user: { id: 'ba-user', email: 'x@example.com' },
      access_token: 'token',
      provider: 'better-auth',
    };

    it('signs in through the Better Auth browser session, never Supabase', async () => {
      mockAuthService.signInWithOAuth.mockResolvedValueOnce({
        user: nativeSession.user,
        session: nativeSession,
      } as any);
      const { captured, testAct } = mountUseAuth(platform);

      let result: any;
      await testAct(async () => {
        result = await captured.signInWithOAuth('twitter');
      });

      expect(mockAuthService.signInWithOAuth).toHaveBeenCalledWith('twitter');
      expect(result.session).toEqual(nativeSession);
      expect(result.error).toBeUndefined();
      expect(mockSupabase.auth.signInWithOAuth).not.toHaveBeenCalled();
    });

    it('treats a dismissed auth session as a quiet cancel', async () => {
      mockAuthService.signInWithOAuth.mockResolvedValueOnce({ cancelled: true } as any);
      const { captured, testAct } = mountUseAuth(platform);

      let result: any;
      await testAct(async () => {
        result = await captured.signInWithOAuth('twitter');
      });

      expect(result).toEqual({ pending: false });
    });

    it('returns provider errors instead of throwing', async () => {
      mockAuthService.signInWithOAuth.mockResolvedValueOnce({ error: 'X denied access' } as any);
      const { captured, testAct } = mountUseAuth(platform);

      let result: any;
      await testAct(async () => {
        result = await captured.signInWithOAuth('twitter');
      });

      expect(result.error).toContain('X denied access');
    });

    it('errors when sign-in completes without a session', async () => {
      mockAuthService.signInWithOAuth.mockResolvedValueOnce({} as any);
      const { captured, testAct } = mountUseAuth(platform);

      let result: any;
      await testAct(async () => {
        result = await captured.signInWithOAuth('twitter');
      });

      expect(result.error).toContain('no Better Auth session');
    });
  });
});
