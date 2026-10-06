/// <reference types="jest" />
/**
 * X (Twitter) sign-in in `useAuth.ts` is web-only: there is no native
 * ID-token exchange wired up for it (unlike Google/Apple) and no
 * deep-link callback path. These tests cover the two branches that code
 * adds to `signInWithOAuth`:
 *
 *   - web:   route `twitter` through Better Auth's social redirect flow.
 *   - native (android/ios): return a controlled error instead of falling
 *     through to the Google/Apple native paths.
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

  it.each(['android', 'ios'])('returns a controlled error for Twitter on %s (no native ID-token path)', async (platform) => {
    const { captured, testAct } = mountUseAuth(platform);

    let result: any;
    await testAct(async () => {
      result = await captured.signInWithOAuth('twitter');
    });

    expect(result).toEqual({
      error: 'Sign in with X is available on the web only.',
    });
    // No provider must have been contacted on native — this is a pure
    // client-side guard, not a failed network call.
    expect(mockAuthService.signInWithOAuth).not.toHaveBeenCalled();
    expect(mockSupabase.auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(mockBetterAuthSignInWithOAuth).not.toHaveBeenCalled();
  });
});
