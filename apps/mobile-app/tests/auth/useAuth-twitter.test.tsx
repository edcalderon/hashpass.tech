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
  getProviderName: jest.fn(() => 'better-auth'),
  signOut: jest.fn(async () => undefined),
  getSession: jest.fn(async () => null),
  onAuthStateChange: jest.fn(() => () => {}),
};

const mockBetterAuthSignInWithOAuth = jest.fn(async () => ({ pending: true }));
const MockBetterAuthProvider = jest.fn().mockImplementation(() => ({
  onAuthStateChange: jest.fn(() => () => {}),
  getSession: jest.fn(async () => null),
  signOut: jest.fn(async () => undefined),
  signInWithOAuth: mockBetterAuthSignInWithOAuth,
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
      TestRenderer.create(React.createElement(Harness));
    });
  });

  return { captured, testAct };
};

describe('useAuth X (Twitter) sign-in', () => {
  beforeEach(() => {
    jest.resetModules();
    mockAuthService.signInWithOAuth.mockClear();
    mockBetterAuthSignInWithOAuth.mockClear();
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
    // directly; otherwise it uses the lazy `getGoogleBetterAuthProvider()`.
    expect(mockAuthService.signInWithOAuth).toHaveBeenCalledWith('twitter');
    // Twitter must NOT fall through to the Supabase OAuth path, nor to the
    // native Google/Apple flows — it is a pure Better Auth social provider.
    expect(mockSupabase.auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(mockBetterAuthSignInWithOAuth).not.toHaveBeenCalled();
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
