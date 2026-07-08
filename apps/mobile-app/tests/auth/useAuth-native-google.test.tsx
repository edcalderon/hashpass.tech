/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

const mockAuthService = {
  signInWithOAuth: jest.fn(async () => ({
    pending: true,
    oauthUrl: 'https://example.supabase.co/auth/v1/authorize',
  })),
  getProviderName: jest.fn(() => 'supabase'),
  handleOAuthCallback: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  getSession: jest.fn(async () => null),
  onAuthStateChange: jest.fn(() => () => {}),
  isAuthenticated: jest.fn(() => false),
  getUser: jest.fn(() => null),
};

const mockSignInWithNativeGoogleAccount = jest.fn(async () => ({ idToken: 'native-id-token' }));
const mockOpenAuthSessionAsync = jest.fn();

const mockSupabase = {
  auth: {
    onAuthStateChange: jest.fn(() => ({
      data: {
        subscription: {
          unsubscribe: jest.fn(),
        },
      },
    })),
    getSession: jest.fn(async () => ({ data: { session: null } })),
    signInWithIdToken: jest.fn(async () => ({
      data: {
        session: {
          user: {
            id: 'supabase-user',
            email: 'user@example.com',
            user_metadata: {},
          },
        },
      },
      error: null,
    })),
    signOut: jest.fn(async () => ({ error: null })),
    verifyOtp: jest.fn(async () => ({ data: null, error: null })),
  },
};

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

describe('useAuth native Google sign-in', () => {
  beforeEach(() => {
    jest.resetModules();
    mockAuthService.signInWithOAuth.mockClear();
    mockAuthService.getProviderName.mockClear();
    mockAuthService.getSession.mockClear();
    mockAuthService.onAuthStateChange.mockClear();
    mockSignInWithNativeGoogleAccount.mockClear();
    mockOpenAuthSessionAsync.mockClear();
    mockSupabase.auth.signInWithIdToken.mockClear();
    mockSupabase.auth.getSession.mockClear();
    mockSupabase.auth.onAuthStateChange.mockClear();
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', undefined);
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', undefined);
    setEnv('GOOGLE_CLIENT_ID', undefined);
    setEnv('BETTER_AUTH_GOOGLE_CLIENT_ID', undefined);
  });

  afterEach(() => {
    restoreEnv();
  });

  it('uses the native SDK before provider OAuth on Android when the Google web client id exists', async () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', 'true');

    let capturedHook: any = null;
    let testAct: any = null;

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: 'android' },
      }));

      jest.doMock('@hashpass/auth', () => ({
        authService: mockAuthService,
        getSupabaseOAuthRedirectUrl: jest.fn(() => 'myapp://auth/callback'),
      }));

      jest.doMock('../../lib/supabase', () => ({
        supabase: mockSupabase,
        createSessionFromUrl: jest.fn(),
      }));

      jest.doMock('../../lib/native-google-signin', () => ({
        clearNativeGoogleAccount: jest.fn(),
        nativeGoogleSigninStatusCodes: {
          SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
          PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
        },
        signInWithNativeGoogleAccount: mockSignInWithNativeGoogleAccount,
      }));

      jest.doMock('../../lib/auth/oauth/callback-params', () => ({
        mergeOAuthFragmentParams: jest.fn((params: URLSearchParams, extras: Record<string, string>) => ({
          ...Object.fromEntries(params.entries()),
          ...extras,
        })),
      }));

      jest.doMock('expo-web-browser', () => ({
        __esModule: true,
        openAuthSessionAsync: mockOpenAuthSessionAsync,
      }));

      const React = require('react');
      const TestRenderer = require('react-test-renderer');
      const { useAuth } = require('../../hooks/useAuth');
      testAct = TestRenderer.act;

      const Harness = () => {
        capturedHook = useAuth();
        return null;
      };

      TestRenderer.act(() => {
        TestRenderer.create(React.createElement(Harness));
      });
    });

    expect(capturedHook).toBeTruthy();

    await testAct(async () => {
      await capturedHook.signInWithOAuth('google');
    });

    expect(mockSignInWithNativeGoogleAccount).toHaveBeenCalledTimes(1);
    expect(mockAuthService.signInWithOAuth).not.toHaveBeenCalled();
    expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
    expect(mockSupabase.auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'native-id-token',
    });
  });

  it('skips native SDK for Directus provider and falls through to browser OAuth', async () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', 'true');

    const mockDirectusAuthService = {
      ...mockAuthService,
      getProviderName: jest.fn(() => 'directus'),
      signInWithOAuth: jest.fn(async () => ({
        pending: true,
        oauthUrl: 'https://example.directus/auth/login/google?redirect=...',
      })),
    };

    let capturedHook: any = null;
    let testAct: any = null;

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: 'android' },
      }));

      jest.doMock('@hashpass/auth', () => ({
        authService: mockDirectusAuthService,
        getSupabaseOAuthRedirectUrl: jest.fn(() => 'myapp://auth/callback'),
      }));

      jest.doMock('../../lib/supabase', () => ({
        supabase: mockSupabase,
        createSessionFromUrl: jest.fn(),
      }));

      jest.doMock('../../lib/native-google-signin', () => ({
        clearNativeGoogleAccount: jest.fn(),
        nativeGoogleSigninStatusCodes: {
          SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
          PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
        },
        signInWithNativeGoogleAccount: mockSignInWithNativeGoogleAccount,
      }));

      jest.doMock('../../lib/auth/oauth/callback-params', () => ({
        mergeOAuthFragmentParams: jest.fn((params: URLSearchParams, extras: Record<string, string>) => ({
          ...Object.fromEntries(params.entries()),
          ...extras,
        })),
      }));

      jest.doMock('expo-web-browser', () => ({
        __esModule: true,
        openAuthSessionAsync: mockOpenAuthSessionAsync.mockResolvedValueOnce({ type: 'cancel' }),
      }));

      const React = require('react');
      const TestRenderer = require('react-test-renderer');
      const { useAuth } = require('../../hooks/useAuth');
      testAct = TestRenderer.act;

      const Harness = () => {
        capturedHook = useAuth();
        return null;
      };

      TestRenderer.act(() => {
        TestRenderer.create(React.createElement(Harness));
      });
    });

    expect(capturedHook).toBeTruthy();

    await testAct(async () => {
      try {
        await capturedHook.signInWithOAuth('google');
      } catch {
        // browser cancel throws — acceptable in this test
      }
    });

    // Native SDK must NOT fire for Directus; browser OAuth must be used instead
    expect(mockSignInWithNativeGoogleAccount).not.toHaveBeenCalled();
    expect(mockDirectusAuthService.signInWithOAuth).toHaveBeenCalledWith('google');
    expect(mockSupabase.auth.signInWithIdToken).not.toHaveBeenCalled();
  });
});
