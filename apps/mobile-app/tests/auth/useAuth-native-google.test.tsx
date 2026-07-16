/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */

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

const mockIdleBetterAuthProviderSignOut = jest.fn(async () => undefined);

const MockIdleBetterAuthProvider = jest.fn().mockImplementation(() => ({
  onAuthStateChange: jest.fn(() => () => {}),
  getSession: jest.fn(async () => null),
  signOut: mockIdleBetterAuthProviderSignOut,
  signInWithIdToken: jest.fn(async () => ({
    error: 'Better Auth is not configured for this test.',
  })),
}));

const mockSignInWithNativeGoogleAccount = jest.fn(async () => ({ idToken: 'native-id-token' }));
const mockClearNativeGoogleAccount = jest.fn(async () => undefined);
const mockOpenAuthSessionAsync = jest.fn();
const mockMarkRecentAuthSuccess = jest.fn();

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
    signInWithOAuth: jest.fn(async () => ({
      data: {
        url: 'https://example.supabase.co/auth/v1/authorize?provider=google',
      },
      error: null,
    })),
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
    mockAuthService.signOut.mockClear();
    mockIdleBetterAuthProviderSignOut.mockClear();
    mockSignInWithNativeGoogleAccount.mockReset().mockResolvedValue({ idToken: 'native-id-token' });
    mockClearNativeGoogleAccount.mockReset().mockResolvedValue(undefined);
    mockOpenAuthSessionAsync.mockReset();
    mockMarkRecentAuthSuccess.mockClear();
    mockSupabase.auth.signInWithOAuth.mockClear();
    mockSupabase.auth.signInWithIdToken.mockClear();
    mockSupabase.auth.getSession.mockClear();
    mockSupabase.auth.onAuthStateChange.mockClear();
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', undefined);
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', undefined);
    setEnv('GOOGLE_CLIENT_ID', undefined);
    setEnv('BETTER_AUTH_GOOGLE_CLIENT_ID', undefined);
    jest.dontMock('../../lib/auth/recent-auth');
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
        BetterAuthProvider: MockIdleBetterAuthProvider,
        getSupabaseOAuthRedirectUrl: jest.fn(() => 'myapp://auth/callback'),
      }));

      jest.doMock('@hashpass/auth/auth-dependencies', () => ({
        configureAuthService: jest.fn(),
      }));

      jest.doMock('../../lib/supabase', () => ({
        supabase: mockSupabase,
        createSessionFromUrl: jest.fn(),
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
        signInWithNativeGoogleAccount: mockSignInWithNativeGoogleAccount,
      }));

      jest.doMock('../../lib/auth/recent-auth', () => ({
        markRecentAuthSuccess: mockMarkRecentAuthSuccess,
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
    expect(mockSignInWithNativeGoogleAccount).toHaveBeenCalledWith('google-web-client-id');
    expect(mockMarkRecentAuthSuccess).toHaveBeenCalledTimes(1);
    expect(mockAuthService.signInWithOAuth).not.toHaveBeenCalled();
    expect(mockAuthService.signOut).not.toHaveBeenCalled();
    expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
    expect(mockSupabase.auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'native-id-token',
    });
  });

  it('uses the native SDK by default on Android when the Google web client id exists', async () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');
    const mockCreateSessionFromUrl = jest.fn();

    let capturedHook: any = null;
    let testAct: any = null;

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: 'android' },
      }));

      jest.doMock('@hashpass/auth', () => ({
        authService: mockAuthService,
        BetterAuthProvider: MockIdleBetterAuthProvider,
        getSupabaseOAuthRedirectUrl: jest.fn(() => 'myapp://auth/callback'),
      }));

      jest.doMock('@hashpass/auth/auth-dependencies', () => ({
        configureAuthService: jest.fn(),
      }));

      jest.doMock('../../lib/supabase', () => ({
        supabase: mockSupabase,
        createSessionFromUrl: mockCreateSessionFromUrl,
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
        signInWithNativeGoogleAccount: mockSignInWithNativeGoogleAccount,
      }));

      jest.doMock('../../lib/auth/recent-auth', () => ({
        markRecentAuthSuccess: mockMarkRecentAuthSuccess,
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

    let result: any;
    await testAct(async () => {
      result = await capturedHook.signInWithOAuth('google');
    });

    expect(result).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          id: 'supabase-user',
          email: 'user@example.com',
        }),
        session: expect.objectContaining({
          user: expect.objectContaining({
            id: 'supabase-user',
            email: 'user@example.com',
          }),
        }),
      })
    );
    expect(mockSignInWithNativeGoogleAccount).toHaveBeenCalledWith('google-web-client-id');
    expect(mockAuthService.signInWithOAuth).not.toHaveBeenCalled();
    expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
    expect(mockCreateSessionFromUrl).not.toHaveBeenCalled();
    expect(mockSupabase.auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'native-id-token',
    });
    expect(mockMarkRecentAuthSuccess).toHaveBeenCalledTimes(1);
    expect(capturedHook.isLoggedIn).toBe(true);
    expect(capturedHook.user).toEqual(
      expect.objectContaining({
        id: 'supabase-user',
        email: 'user@example.com',
      })
    );
    expect(capturedHook.isLoading).toBe(false);
  });

  it('uses the restored Supabase session when Android browser OAuth dismisses after the app callback', async () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', 'false');
    mockOpenAuthSessionAsync.mockResolvedValueOnce({
      type: 'dismiss',
    });
    mockSupabase.auth.getSession
      .mockResolvedValueOnce({ data: { session: null } } as any)
      .mockResolvedValueOnce({
        data: {
          session: {
            access_token: 'restored-access-token',
            refresh_token: 'restored-refresh-token',
            expires_at: 1234567890,
            user: {
              id: 'supabase-user',
              email: 'user@example.com',
              user_metadata: {},
            },
          },
        },
      } as any);
    const mockCreateSessionFromUrl = jest.fn();

    let capturedHook: any = null;
    let testAct: any = null;

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: 'android' },
      }));

      jest.doMock('@hashpass/auth', () => ({
        authService: mockAuthService,
        BetterAuthProvider: MockIdleBetterAuthProvider,
        getSupabaseOAuthRedirectUrl: jest.fn(() => 'myapp://auth/callback'),
      }));

      jest.doMock('@hashpass/auth/auth-dependencies', () => ({
        configureAuthService: jest.fn(),
      }));

      jest.doMock('../../lib/supabase', () => ({
        supabase: mockSupabase,
        createSessionFromUrl: mockCreateSessionFromUrl,
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
        signInWithNativeGoogleAccount: mockSignInWithNativeGoogleAccount,
      }));

      jest.doMock('../../lib/auth/recent-auth', () => ({
        markRecentAuthSuccess: mockMarkRecentAuthSuccess,
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

    let result: any;
    await testAct(async () => {
      result = await capturedHook.signInWithOAuth('google');
    });

    expect(result).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          id: 'supabase-user',
          email: 'user@example.com',
        }),
        session: expect.objectContaining({
          access_token: 'restored-access-token',
          provider: 'supabase',
          user: expect.objectContaining({
            id: 'supabase-user',
            email: 'user@example.com',
          }),
        }),
      })
    );
    expect(mockOpenAuthSessionAsync).toHaveBeenCalledWith(
      'https://example.supabase.co/auth/v1/authorize',
      'myapp://auth/callback'
    );
    expect(mockCreateSessionFromUrl).not.toHaveBeenCalled();
    expect(mockMarkRecentAuthSuccess).toHaveBeenCalledTimes(1);
    expect(capturedHook.isLoggedIn).toBe(true);
    expect(capturedHook.user).toEqual(
      expect.objectContaining({
        id: 'supabase-user',
        email: 'user@example.com',
      })
    );
    expect(capturedHook.isLoading).toBe(false);
  });

  it('hydrates Android browser Google OAuth from a native Linking callback', async () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', 'false');
    const callbackUrl = 'myapp://auth/callback?code=oauth-code-123';
    let nativeUrlHandler: ((event: { url: string }) => void) | null = null;
    const removeLinkingListener = jest.fn();
    const mockLinkingAddEventListener = jest.fn((_eventName: string, handler: (event: { url: string }) => void) => {
      nativeUrlHandler = handler;
      return { remove: removeLinkingListener };
    });
    const mockDismissAuthSession = jest.fn();
    let resolveBrowserResult: (result: { type: string }) => void = () => {};
    mockOpenAuthSessionAsync.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveBrowserResult = resolve;
      })
    );
    const mockCreateSessionFromUrl = jest.fn(async () => ({
      session: {
        user: {
          id: 'supabase-user',
          email: 'user@example.com',
          user_metadata: {},
        },
      },
      error: null,
    }));

    let capturedHook: any = null;
    let testAct: any = null;

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: 'android' },
        Linking: {
          addEventListener: mockLinkingAddEventListener,
        },
      }));

      jest.doMock('@hashpass/auth', () => ({
        authService: mockAuthService,
        BetterAuthProvider: MockIdleBetterAuthProvider,
        getSupabaseOAuthRedirectUrl: jest.fn(() => 'myapp://auth/callback'),
      }));

      jest.doMock('@hashpass/auth/auth-dependencies', () => ({
        configureAuthService: jest.fn(),
      }));

      jest.doMock('../../lib/supabase', () => ({
        supabase: mockSupabase,
        createSessionFromUrl: mockCreateSessionFromUrl,
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
        signInWithNativeGoogleAccount: mockSignInWithNativeGoogleAccount,
      }));

      jest.doMock('../../lib/auth/recent-auth', () => ({
        markRecentAuthSuccess: mockMarkRecentAuthSuccess,
      }));

      jest.doMock('../../lib/auth/oauth/callback-params', () => ({
        mergeOAuthFragmentParams: jest.fn((params: URLSearchParams, extras: Record<string, string>) => ({
          ...Object.fromEntries(params.entries()),
          ...extras,
        })),
      }));

      jest.doMock('expo-web-browser', () => ({
        __esModule: true,
        dismissAuthSession: mockDismissAuthSession,
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

    let authPromise: Promise<any>;
    await testAct(async () => {
      authPromise = capturedHook.signInWithOAuth('google');
      for (let attempt = 0; attempt < 5 && !nativeUrlHandler; attempt += 1) {
        await Promise.resolve();
      }
    });

    expect(mockLinkingAddEventListener).toHaveBeenCalledWith('url', expect.any(Function));
    expect(nativeUrlHandler).toEqual(expect.any(Function));
    (nativeUrlHandler as unknown as (event: { url: string }) => void)({ url: callbackUrl });

    let result: any;
    await testAct(async () => {
      result = await authPromise;
    });
    resolveBrowserResult({ type: 'dismiss' });

    expect(result).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          id: 'supabase-user',
          email: 'user@example.com',
        }),
      })
    );
    expect(mockOpenAuthSessionAsync).toHaveBeenCalledWith(
      'https://example.supabase.co/auth/v1/authorize',
      'myapp://auth/callback'
    );
    expect(mockCreateSessionFromUrl).toHaveBeenCalledWith(callbackUrl);
    expect(mockDismissAuthSession).toHaveBeenCalledTimes(1);
    expect(removeLinkingListener).toHaveBeenCalledTimes(1);
    expect(mockMarkRecentAuthSuccess).toHaveBeenCalledTimes(1);
    expect(capturedHook.isLoggedIn).toBe(true);
    expect(capturedHook.user).toEqual(
      expect.objectContaining({
        id: 'supabase-user',
        email: 'user@example.com',
      })
    );
  });

  it('falls back to the browser callback when Android Linking listener registration fails', async () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', 'false');
    const callbackUrl = 'myapp://auth/callback?code=oauth-code-456';
    const mockLinkingAddEventListener = jest.fn(() => {
      throw new Error('Linking listener unavailable');
    });
    const mockCreateSessionFromUrl = jest.fn(async () => ({
      session: {
        user: {
          id: 'supabase-user',
          email: 'user@example.com',
          user_metadata: {},
        },
      },
      error: null,
    }));

    mockOpenAuthSessionAsync.mockResolvedValueOnce({
      type: 'success',
      url: callbackUrl,
    });

    let capturedHook: any = null;
    let testAct: any = null;

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: 'android' },
        Linking: {
          addEventListener: mockLinkingAddEventListener,
        },
      }));

      jest.doMock('@hashpass/auth', () => ({
        authService: mockAuthService,
        BetterAuthProvider: MockIdleBetterAuthProvider,
        getSupabaseOAuthRedirectUrl: jest.fn(() => 'myapp://auth/callback'),
      }));

      jest.doMock('@hashpass/auth/auth-dependencies', () => ({
        configureAuthService: jest.fn(),
      }));

      jest.doMock('../../lib/supabase', () => ({
        supabase: mockSupabase,
        createSessionFromUrl: mockCreateSessionFromUrl,
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
        signInWithNativeGoogleAccount: mockSignInWithNativeGoogleAccount,
      }));

      jest.doMock('../../lib/auth/recent-auth', () => ({
        markRecentAuthSuccess: mockMarkRecentAuthSuccess,
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

    let result: any;
    await testAct(async () => {
      result = await capturedHook.signInWithOAuth('google');
    });

    expect(mockLinkingAddEventListener).toHaveBeenCalledWith('url', expect.any(Function));
    expect(mockOpenAuthSessionAsync).toHaveBeenCalledWith(
      'https://example.supabase.co/auth/v1/authorize',
      'myapp://auth/callback'
    );
    expect(mockCreateSessionFromUrl).toHaveBeenCalledWith(callbackUrl);
    expect(result).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          id: 'supabase-user',
          email: 'user@example.com',
        }),
      })
    );
    expect(mockMarkRecentAuthSuccess).toHaveBeenCalledTimes(1);
    expect(capturedHook.isLoggedIn).toBe(true);
  });

  it('prefers the Better Auth session when Better Auth accepts the native Google ID token', async () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', 'true');

    const betterAuthSession = {
      user: {
        id: 'better-auth-user',
        email: 'user@example.com',
      },
      access_token: 'better_auth_session',
      provider: 'better-auth',
    };
    const mockBetterAuthSignInWithIdToken = jest.fn(async () => ({
      user: betterAuthSession.user,
      session: betterAuthSession,
    }));
    const MockBetterAuthProvider = jest.fn().mockImplementation(() => ({
      onAuthStateChange: jest.fn(() => () => {}),
      getSession: jest.fn(async () => null),
      signOut: jest.fn(async () => undefined),
      signInWithIdToken: mockBetterAuthSignInWithIdToken,
    }));

    let capturedHook: any = null;
    let testAct: any = null;

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: 'android' },
      }));

      jest.doMock('@hashpass/auth', () => ({
        authService: mockAuthService,
        BetterAuthProvider: MockBetterAuthProvider,
        getSupabaseOAuthRedirectUrl: jest.fn(() => 'myapp://auth/callback'),
      }));

      jest.doMock('@hashpass/auth/auth-dependencies', () => ({
        configureAuthService: jest.fn(),
      }));

      jest.doMock('../../lib/supabase', () => ({
        supabase: mockSupabase,
        createSessionFromUrl: jest.fn(),
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
        signInWithNativeGoogleAccount: mockSignInWithNativeGoogleAccount,
      }));

      jest.doMock('../../lib/auth/recent-auth', () => ({
        markRecentAuthSuccess: mockMarkRecentAuthSuccess,
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

    let result: any;
    await testAct(async () => {
      result = await capturedHook.signInWithOAuth('google');
    });

    expect(result).toEqual({
      user: betterAuthSession.user,
      session: betterAuthSession,
    });
    expect(MockBetterAuthProvider).toHaveBeenCalledTimes(1);
    expect(mockBetterAuthSignInWithIdToken).toHaveBeenCalledWith('google', 'native-id-token');
    expect(mockSupabase.auth.signInWithIdToken).not.toHaveBeenCalled();
    expect(capturedHook.isLoggedIn).toBe(true);
    expect(capturedHook.user).toEqual(betterAuthSession.user);
    expect(capturedHook.isLoading).toBe(false);
  });

  it('falls back to Supabase without throwing when Better Auth rejects the native Google ID token', async () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', 'true');

    const mockBetterAuthSignInWithIdToken = jest.fn(async () => ({
      error: 'Better Auth rejected the native Google ID token.',
    }));
    const MockBetterAuthProvider = jest.fn().mockImplementation(() => ({
      onAuthStateChange: jest.fn(() => () => {}),
      getSession: jest.fn(async () => null),
      signOut: jest.fn(async () => undefined),
      signInWithIdToken: mockBetterAuthSignInWithIdToken,
    }));

    let capturedHook: any = null;
    let testAct: any = null;

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: 'android' },
      }));

      jest.doMock('@hashpass/auth', () => ({
        authService: mockAuthService,
        BetterAuthProvider: MockBetterAuthProvider,
        getSupabaseOAuthRedirectUrl: jest.fn(() => 'myapp://auth/callback'),
      }));

      jest.doMock('@hashpass/auth/auth-dependencies', () => ({
        configureAuthService: jest.fn(),
      }));

      jest.doMock('../../lib/supabase', () => ({
        supabase: mockSupabase,
        createSessionFromUrl: jest.fn(),
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
        signInWithNativeGoogleAccount: mockSignInWithNativeGoogleAccount,
      }));

      jest.doMock('../../lib/auth/recent-auth', () => ({
        markRecentAuthSuccess: mockMarkRecentAuthSuccess,
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

    let result: any;
    await testAct(async () => {
      result = await capturedHook.signInWithOAuth('google');
    });

    expect(result).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          id: 'supabase-user',
          email: 'user@example.com',
        }),
        session: expect.objectContaining({
          provider: 'supabase',
          user: expect.objectContaining({
            id: 'supabase-user',
            email: 'user@example.com',
          }),
        }),
      })
    );
    expect(mockBetterAuthSignInWithIdToken).toHaveBeenCalledWith('google', 'native-id-token');
    expect(mockMarkRecentAuthSuccess).toHaveBeenCalledTimes(1);
    expect(mockSupabase.auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'native-id-token',
    });
    expect(mockBetterAuthSignInWithIdToken.mock.invocationCallOrder[0]).toBeLessThan(
      mockSupabase.auth.signInWithIdToken.mock.invocationCallOrder[0]
    );
    expect(capturedHook.isLoggedIn).toBe(true);
    expect(capturedHook.user).toEqual(
      expect.objectContaining({
        id: 'supabase-user',
        email: 'user@example.com',
      })
    );
    expect(capturedHook.isLoading).toBe(false);
  });

  it('uses the native SDK even when Directus is the selected provider if Supabase is configured', async () => {
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
        BetterAuthProvider: MockIdleBetterAuthProvider,
        getSupabaseOAuthRedirectUrl: jest.fn(() => 'myapp://auth/callback'),
      }));

      jest.doMock('@hashpass/auth/auth-dependencies', () => ({
        configureAuthService: jest.fn(),
      }));

      jest.doMock('../../lib/supabase', () => ({
        supabase: mockSupabase,
        createSessionFromUrl: jest.fn(),
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
      await capturedHook.signInWithOAuth('google');
    });

    expect(mockSignInWithNativeGoogleAccount).toHaveBeenCalledTimes(1);
    expect(mockDirectusAuthService.signOut).toHaveBeenCalledTimes(1);
    expect(mockDirectusAuthService.signInWithOAuth).not.toHaveBeenCalled();
    expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
    expect(mockSupabase.auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'native-id-token',
    });
  });

  it('returns cleanly when the native Google account picker is cancelled', async () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', 'true');
    mockSignInWithNativeGoogleAccount.mockRejectedValueOnce(
      Object.assign(new Error('Google Sign-In was cancelled.'), {
        code: 'SIGN_IN_CANCELLED',
      })
    );

    let capturedHook: any = null;
    let testAct: any = null;

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: 'android' },
      }));

      jest.doMock('@hashpass/auth', () => ({
        authService: mockAuthService,
        BetterAuthProvider: MockIdleBetterAuthProvider,
        getSupabaseOAuthRedirectUrl: jest.fn(() => 'myapp://auth/callback'),
      }));

      jest.doMock('@hashpass/auth/auth-dependencies', () => ({
        configureAuthService: jest.fn(),
      }));

      jest.doMock('../../lib/supabase', () => ({
        supabase: mockSupabase,
        createSessionFromUrl: jest.fn(),
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

    let result: any;
    await testAct(async () => {
      result = await capturedHook.signInWithOAuth('google');
    });

    expect(result).toEqual({ pending: false });
    expect(mockSignInWithNativeGoogleAccount).toHaveBeenCalledTimes(1);
    expect(mockAuthService.signInWithOAuth).not.toHaveBeenCalled();
    expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
    expect(mockSupabase.auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('returns a controlled error when the native picker returns without an ID token', async () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');
    mockSignInWithNativeGoogleAccount.mockRejectedValueOnce(
      Object.assign(
        new Error('Google Sign-In did not return an ID token (response type: success).'),
        { code: 'GOOGLE_ID_TOKEN_MISSING' }
      )
    );

    let capturedHook: any = null;
    let testAct: any = null;

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: 'android' },
      }));

      jest.doMock('@hashpass/auth', () => ({
        authService: mockAuthService,
        BetterAuthProvider: MockIdleBetterAuthProvider,
        getSupabaseOAuthRedirectUrl: jest.fn(() => 'myapp://auth/callback'),
      }));

      jest.doMock('@hashpass/auth/auth-dependencies', () => ({
        configureAuthService: jest.fn(),
      }));

      jest.doMock('../../lib/supabase', () => ({
        supabase: mockSupabase,
        createSessionFromUrl: jest.fn(),
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

    let result: any;
    await testAct(async () => {
      result = await capturedHook.signInWithOAuth('google');
    });

    expect(result).toEqual({
      error: expect.stringContaining('ID token'),
    });
    expect(mockSignInWithNativeGoogleAccount).toHaveBeenCalledWith('google-web-client-id');
    expect(mockAuthService.signInWithOAuth).not.toHaveBeenCalled();
    expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
    expect(mockSupabase.auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('returns a controlled error when native ID-token exchange fails after account selection', async () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');
    mockSupabase.auth.signInWithIdToken.mockResolvedValueOnce({
      data: null,
      error: new Error('Supabase rejected the native Google ID token.'),
    } as never);

    const mockBetterAuthSignInWithIdToken = jest.fn(async () => ({
      error: 'Better Auth rejected the native Google ID token.',
    }));
    const MockBetterAuthProvider = jest.fn().mockImplementation(() => ({
      onAuthStateChange: jest.fn(() => () => {}),
      getSession: jest.fn(async () => null),
      signOut: jest.fn(async () => undefined),
      signInWithIdToken: mockBetterAuthSignInWithIdToken,
    }));

    let capturedHook: any = null;
    let testAct: any = null;

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: 'android' },
      }));

      jest.doMock('@hashpass/auth', () => ({
        authService: mockAuthService,
        BetterAuthProvider: MockBetterAuthProvider,
        getSupabaseOAuthRedirectUrl: jest.fn(() => 'myapp://auth/callback'),
      }));

      jest.doMock('@hashpass/auth/auth-dependencies', () => ({
        configureAuthService: jest.fn(),
      }));

      jest.doMock('../../lib/supabase', () => ({
        supabase: mockSupabase,
        createSessionFromUrl: jest.fn(),
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
        signInWithNativeGoogleAccount: mockSignInWithNativeGoogleAccount,
      }));

      jest.doMock('../../lib/auth/recent-auth', () => ({
        markRecentAuthSuccess: mockMarkRecentAuthSuccess,
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

    let result: any;
    await testAct(async () => {
      result = await capturedHook.signInWithOAuth('google');
    });

    expect(result).toEqual({
      error: expect.stringContaining('Supabase rejected the native Google ID token.'),
    });
    expect(mockSignInWithNativeGoogleAccount).toHaveBeenCalledWith('google-web-client-id');
    expect(mockBetterAuthSignInWithIdToken).toHaveBeenCalledWith('google', 'native-id-token');
    expect(mockAuthService.signInWithOAuth).not.toHaveBeenCalled();
    expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
    expect(mockMarkRecentAuthSuccess).not.toHaveBeenCalled();
  });

  it('continues app sign-out when clearing the native Google account fails', async () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', 'true');
    mockClearNativeGoogleAccount.mockRejectedValueOnce(new Error('Google SDK signOut failed'));

    let capturedHook: any = null;
    let testAct: any = null;

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: 'android' },
      }));

      jest.doMock('@hashpass/auth', () => ({
        authService: mockAuthService,
        BetterAuthProvider: MockIdleBetterAuthProvider,
        getSupabaseOAuthRedirectUrl: jest.fn(() => 'myapp://auth/callback'),
      }));

      jest.doMock('@hashpass/auth/auth-dependencies', () => ({
        configureAuthService: jest.fn(),
      }));

      jest.doMock('../../lib/supabase', () => ({
        supabase: mockSupabase,
        createSessionFromUrl: jest.fn(),
      }));

      jest.doMock('../../config/supabase-profiles', () => ({
        resolvePublicSupabaseConfig: jest.fn(() => ({
          supabaseUrl: 'https://example.supabase.co',
          supabaseAnonKey: 'anon-key',
        })),
      }));

      jest.doMock('../../lib/native-google-signin', () => ({
        clearNativeGoogleAccount: mockClearNativeGoogleAccount,
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

    await testAct(async () => {
      await capturedHook.signOut();
    });

    expect(mockClearNativeGoogleAccount).toHaveBeenCalledTimes(1);
    expect(mockIdleBetterAuthProviderSignOut).toHaveBeenCalledTimes(1);
    expect(mockAuthService.signOut).toHaveBeenCalledTimes(1);
    expect(mockSupabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('falls back to browser OAuth when the native Google SDK is unavailable', async () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', 'true');
    mockSignInWithNativeGoogleAccount.mockRejectedValueOnce(
      Object.assign(
        new Error('Native Google Sign-In is unavailable: RNGoogleSignin could not be found'),
        { code: 'GOOGLE_SIGN_IN_UNAVAILABLE' }
      )
    );
    mockOpenAuthSessionAsync.mockResolvedValueOnce({
      type: 'success',
      url: 'myapp://auth/callback#access_token=native-browser-token',
    });
    const mockCreateSessionFromUrl = jest.fn(async () => ({
      session: {
        user: {
          id: 'supabase-user',
          email: 'user@example.com',
          user_metadata: {},
        },
      },
      error: null,
    }));

    let capturedHook: any = null;
    let testAct: any = null;

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: 'android' },
      }));

      jest.doMock('@hashpass/auth', () => ({
        authService: mockAuthService,
        BetterAuthProvider: MockIdleBetterAuthProvider,
        getSupabaseOAuthRedirectUrl: jest.fn(() => 'myapp://auth/callback'),
      }));

      jest.doMock('@hashpass/auth/auth-dependencies', () => ({
        configureAuthService: jest.fn(),
      }));

      jest.doMock('../../lib/supabase', () => ({
        supabase: mockSupabase,
        createSessionFromUrl: mockCreateSessionFromUrl,
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
          IN_PROGRESS: 'ASYNC_OP_IN_PROGRESS',
          PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
          NULL_PRESENTER: 'NULL_PRESENTER',
        },
        signInWithNativeGoogleAccount: mockSignInWithNativeGoogleAccount,
      }));

      jest.doMock('../../lib/auth/recent-auth', () => ({
        markRecentAuthSuccess: mockMarkRecentAuthSuccess,
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

    let result: any;
    await testAct(async () => {
      result = await capturedHook.signInWithOAuth('google');
    });

    expect(result).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          id: 'supabase-user',
          email: 'user@example.com',
        }),
        session: expect.objectContaining({
          user: expect.objectContaining({
            id: 'supabase-user',
            email: 'user@example.com',
          }),
        }),
      })
    );
    expect(mockSignInWithNativeGoogleAccount).toHaveBeenCalledWith('google-web-client-id');
    expect(mockAuthService.signInWithOAuth).toHaveBeenCalledWith('google');
    expect(mockOpenAuthSessionAsync).toHaveBeenCalledWith(
      'https://example.supabase.co/auth/v1/authorize',
      'myapp://auth/callback'
    );
    expect(mockCreateSessionFromUrl).toHaveBeenCalledWith(
      'myapp://auth/callback#access_token=native-browser-token'
    );
    expect(mockMarkRecentAuthSuccess).toHaveBeenCalledTimes(1);
    expect(capturedHook.isLoggedIn).toBe(true);
    expect(capturedHook.user).toEqual(
      expect.objectContaining({
        id: 'supabase-user',
        email: 'user@example.com',
      })
    );
    expect(capturedHook.isLoading).toBe(false);
  });

  it('does not fall back to browser OAuth when Android reports native Google developer config error', async () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', 'true');
    mockSignInWithNativeGoogleAccount.mockRejectedValueOnce(
      Object.assign(new Error('Native Google sign-in failed before account selection'), {
        code: 10,
      })
    );
    const mockCreateSessionFromUrl = jest.fn(async () => ({
      session: {
        user: {
          id: 'supabase-user',
          email: 'user@example.com',
          user_metadata: {},
        },
      },
      error: null,
    }));

    let capturedHook: any = null;
    let testAct: any = null;

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: 'android' },
      }));

      jest.doMock('@hashpass/auth', () => ({
        authService: mockAuthService,
        BetterAuthProvider: MockIdleBetterAuthProvider,
        getSupabaseOAuthRedirectUrl: jest.fn(() => 'myapp://auth/callback'),
      }));

      jest.doMock('@hashpass/auth/auth-dependencies', () => ({
        configureAuthService: jest.fn(),
      }));

      jest.doMock('../../lib/supabase', () => ({
        supabase: mockSupabase,
        createSessionFromUrl: mockCreateSessionFromUrl,
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
          IN_PROGRESS: 'ASYNC_OP_IN_PROGRESS',
          PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
          NULL_PRESENTER: 'NULL_PRESENTER',
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

    let result: any;
    await testAct(async () => {
      result = await capturedHook.signInWithOAuth('google');
    });

    expect(result).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('not configured for this app build'),
      })
    );
    expect(mockSignInWithNativeGoogleAccount).toHaveBeenCalledWith('google-web-client-id');
    expect(mockAuthService.signInWithOAuth).not.toHaveBeenCalled();
    expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
    expect(mockCreateSessionFromUrl).not.toHaveBeenCalled();
    expect(capturedHook.isLoggedIn).toBe(false);
    expect(capturedHook.isLoading).toBe(false);
  });

  it('routes web Google sign-in through Better Auth first, even when the tenant provider is directus', async () => {
    const mockDirectusAuthService = {
      ...mockAuthService,
      getProviderName: jest.fn(() => 'directus'),
      signInWithOAuth: jest.fn(async () => ({
        pending: true,
        oauthUrl: 'https://example.directus/auth/login/google?redirect=...',
      })),
    };

    const mockBetterAuthSignInWithOAuth = jest.fn(async () => ({ pending: true }));
    const MockBetterAuthProvider = jest.fn().mockImplementation(() => ({
      onAuthStateChange: jest.fn(() => () => {}),
      getSession: jest.fn(async () => null),
      signOut: jest.fn(async () => undefined),
      signInWithOAuth: mockBetterAuthSignInWithOAuth,
    }));

    let capturedHook: any = null;
    let testAct: any = null;

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: 'web' },
      }));

      jest.doMock('@hashpass/auth', () => ({
        authService: mockDirectusAuthService,
        BetterAuthProvider: MockBetterAuthProvider,
        getSupabaseOAuthRedirectUrl: jest.fn(() => 'http://localhost:8081/auth/callback'),
      }));

      jest.doMock('@hashpass/auth/auth-dependencies', () => ({
        configureAuthService: jest.fn(),
      }));

      jest.doMock('../../lib/supabase', () => ({
        supabase: mockSupabase,
        createSessionFromUrl: jest.fn(),
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

    expect(MockBetterAuthProvider).toHaveBeenCalledTimes(1);
    expect(mockBetterAuthSignInWithOAuth).toHaveBeenCalledWith('google');
    expect(mockDirectusAuthService.signOut).toHaveBeenCalledTimes(1);
    expect(mockDirectusAuthService.signInWithOAuth).not.toHaveBeenCalled();
    expect(mockSupabase.auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(mockSignInWithNativeGoogleAccount).not.toHaveBeenCalled();
    expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
  });

  it('does not fall back to Supabase OAuth on web when Better Auth fails to start the flow', async () => {
    const mockDirectusAuthService = {
      ...mockAuthService,
      getProviderName: jest.fn(() => 'directus'),
      signInWithOAuth: jest.fn(async () => ({
        pending: true,
        oauthUrl: 'https://example.directus/auth/login/google?redirect=...',
      })),
    };

    const mockBetterAuthSignInWithOAuth = jest.fn(async () => ({
      error: 'Better Auth is not configured for Google on this host.',
    }));
    const MockBetterAuthProvider = jest.fn().mockImplementation(() => ({
      onAuthStateChange: jest.fn(() => () => {}),
      getSession: jest.fn(async () => null),
      signOut: jest.fn(async () => undefined),
      signInWithOAuth: mockBetterAuthSignInWithOAuth,
    }));

    let capturedHook: any = null;
    let testAct: any = null;

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: 'web' },
      }));

      jest.doMock('@hashpass/auth', () => ({
        authService: mockDirectusAuthService,
        BetterAuthProvider: MockBetterAuthProvider,
        getSupabaseOAuthRedirectUrl: jest.fn(() => 'http://localhost:8081/auth/callback'),
      }));

      jest.doMock('@hashpass/auth/auth-dependencies', () => ({
        configureAuthService: jest.fn(),
      }));

      jest.doMock('../../lib/supabase', () => ({
        supabase: mockSupabase,
        createSessionFromUrl: jest.fn(),
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

    await expect(
      testAct(async () => {
        await capturedHook.signInWithOAuth('google');
      })
    ).rejects.toThrow('Better Auth is not configured for Google on this host.');

    expect(mockSupabase.auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(mockDirectusAuthService.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('does not bypass Better Auth tenant Google OAuth on web', async () => {
    const mockBetterAuthService = {
      ...mockAuthService,
      getProviderName: jest.fn(() => 'better-auth'),
      signOut: jest.fn(async () => undefined),
      signInWithOAuth: jest.fn(async () => ({
        pending: true,
        oauthUrl: 'https://api.hashpass.tech/api/auth/sign-in/social?provider=google',
      })),
    };

    let capturedHook: any = null;
    let testAct: any = null;

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: 'web' },
      }));

      jest.doMock('@hashpass/auth', () => ({
        authService: mockBetterAuthService,
        getSupabaseOAuthRedirectUrl: jest.fn(() => 'http://localhost:8081/auth/callback'),
      }));

      jest.doMock('@hashpass/auth/auth-dependencies', () => ({
        configureAuthService: jest.fn(),
      }));

      jest.doMock('../../lib/supabase', () => ({
        supabase: mockSupabase,
        createSessionFromUrl: jest.fn(),
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

    expect(mockBetterAuthService.signInWithOAuth).toHaveBeenCalledWith('google');
    expect(mockBetterAuthService.signOut).not.toHaveBeenCalled();
    expect(mockSupabase.auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(mockSignInWithNativeGoogleAccount).not.toHaveBeenCalled();
  });
});
