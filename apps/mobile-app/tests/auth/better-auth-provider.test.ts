/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

jest.mock('@hashpass/config', () => ({
  ENV_CONFIG: {
    getApiUrl: jest.fn(() => 'https://api.hashpass.tech/api'),
  },
}));

const mockGetSession = jest.fn();
const mockSignInSocial = jest.fn();
const mockSignOut = jest.fn();
const mockCreateAuthClient = jest.fn(() => ({
  signIn: { social: mockSignInSocial },
  signOut: mockSignOut,
  getSession: mockGetSession,
}));

jest.mock('better-auth/client', () => ({
  createAuthClient: mockCreateAuthClient,
}));

/* eslint-disable @typescript-eslint/no-require-imports */

const createBetterAuthSession = () => ({
  user: {
    id: 'user-123',
    email: 'user@example.com',
    name: 'User Example',
    firstName: 'User',
    lastName: 'Example',
    role: 'user',
    banned: false,
    createdAt: new Date('2026-07-08T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-07-08T00:00:00.000Z').toISOString(),
    emailVerified: true,
    image: 'https://example.com/avatar.png',
  },
  session: {
    expiresAt: new Date('2026-07-09T00:00:00.000Z').toISOString(),
  },
});

describe('BetterAuthProvider', () => {
  const originalWindow = global.window;

  const setTestWindow = (value: Window | undefined) => {
    Object.defineProperty(globalThis, 'window', {
      value,
      writable: true,
      configurable: true,
    });
  };

  beforeEach(() => {
    jest.resetModules();
    mockCreateAuthClient.mockClear();
    mockGetSession.mockReset();
    mockSignInSocial.mockReset();
    mockSignOut.mockReset();
    setTestWindow(undefined);
  });

  afterEach(() => {
    setTestWindow(originalWindow);
  });

  it('retries session lookup for web OAuth callbacks before failing', async () => {
    jest.useFakeTimers();

    mockGetSession
      .mockResolvedValueOnce({ data: { user: null, session: null } })
      .mockResolvedValueOnce({ data: createBetterAuthSession() });

    const { BetterAuthProvider } = require('../../../../packages/auth/src/providers/better-auth');
    const provider = new BetterAuthProvider({ baseURL: 'https://api.hashpass.tech/api/auth' });

    const callbackPromise = provider.handleOAuthCallback();
    await jest.advanceTimersByTimeAsync(700);
    const result = await callbackPromise;

    expect(mockCreateAuthClient).toHaveBeenCalledTimes(1);
    expect(mockGetSession).toHaveBeenCalledTimes(2);
    expect(result.error).toBeUndefined();
    expect(result.session?.user.email).toBe('user@example.com');

    jest.useRealTimers();
  });

  it('retries session lookup after native Google sign-in before failing', async () => {
    jest.useFakeTimers();

    mockSignInSocial.mockResolvedValueOnce({});
    mockGetSession
      .mockResolvedValueOnce({ data: { user: null, session: null } })
      .mockResolvedValueOnce({ data: createBetterAuthSession() });

    const { BetterAuthProvider } = require('../../../../packages/auth/src/providers/better-auth');
    const provider = new BetterAuthProvider({ baseURL: 'https://api.hashpass.tech/api/auth' });

    const signInPromise = provider.signInWithIdToken('google', 'id-token-123');
    await jest.advanceTimersByTimeAsync(700);
    const result = await signInPromise;

    expect(mockSignInSocial).toHaveBeenCalledWith({
      provider: 'google',
      idToken: { token: 'id-token-123' },
    });
    expect(mockGetSession).toHaveBeenCalledTimes(2);
    expect(result.error).toBeUndefined();
    expect(result.session?.user.email).toBe('user@example.com');

    jest.useRealTimers();
  });

  it('marks web Google sign-in in localStorage before redirecting', async () => {
    const localStorageSetItem = jest.fn();
    const localStorageGetItem = jest.fn(() => '/dashboard/explore');
    const mockLocalStorage = {
      getItem: localStorageGetItem,
      setItem: localStorageSetItem,
      removeItem: jest.fn(),
      clear: jest.fn(),
      key: jest.fn(),
      get length() {
        return 0;
      },
    } as unknown as Storage;

    setTestWindow({
      location: {
        origin: 'https://hashpass.tech',
        pathname: '/dashboard/explore',
      } as Window['location'],
      localStorage: mockLocalStorage,
    } as Window);

    mockSignInSocial.mockResolvedValueOnce({});

    const { BetterAuthProvider } = require('../../../../packages/auth/src/providers/better-auth');
    const provider = new BetterAuthProvider({ baseURL: 'https://api.hashpass.tech/api/auth' });

    const result = await provider.signInWithOAuth('google');

    expect(localStorageSetItem).toHaveBeenCalledWith('oauth_return_url', '/dashboard/explore');
    expect(localStorageSetItem).toHaveBeenCalledWith('oauth_in_progress', 'true');
    expect(localStorageSetItem).toHaveBeenCalledWith('auth_signin_method', 'google_oauth');
    expect(mockSignInSocial).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        callbackURL: 'https://hashpass.tech/auth/callback?returnTo=%2Fdashboard%2Fexplore',
      })
    );
    expect(result.pending).toBe(true);
  });

  it('adds trusted origin headers for native Better Auth requests', async () => {
    const { Platform } = require('react-native');
    const originalPlatform = Platform.OS;
    const originalSiteUrl = process.env.EXPO_PUBLIC_SITE_URL;
    Platform.OS = 'android';
    process.env.EXPO_PUBLIC_SITE_URL = 'https://hashpass.tech';
    mockSignOut.mockResolvedValueOnce({});

    try {
      const { BetterAuthProvider } = require('../../../../packages/auth/src/providers/better-auth');
      const provider = new BetterAuthProvider({ baseURL: 'https://api.hashpass.tech/api/auth' });

      await provider.signOut();

      expect(mockCreateAuthClient).toHaveBeenCalledWith({
        baseURL: 'https://api.hashpass.tech/api/auth',
        fetchOptions: {
          headers: {
            Origin: 'https://hashpass.tech',
            Referer: 'https://hashpass.tech/',
          },
        },
      });
    } finally {
      Platform.OS = originalPlatform;
      if (typeof originalSiteUrl === 'string') {
        process.env.EXPO_PUBLIC_SITE_URL = originalSiteUrl;
      } else {
        delete process.env.EXPO_PUBLIC_SITE_URL;
      }
    }
  });

  it('keeps the last-known session when getSession fails at the network level', async () => {
    mockGetSession
      .mockResolvedValueOnce({ data: createBetterAuthSession() })
      .mockRejectedValueOnce(new TypeError('Network request failed'));

    const { BetterAuthProvider } = require('../../../../packages/auth/src/providers/better-auth');
    const provider = new BetterAuthProvider({ baseURL: 'https://api.hashpass.tech/api/auth' });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const stateChanges: unknown[] = [];
    provider.onAuthStateChange((session: unknown) => stateChanges.push(session));

    const initial = await provider.getSession({ force: true });
    expect(initial?.user?.id).toBe('user-123');

    const afterNetworkFailure = await provider.getSession({ force: true });

    expect(afterNetworkFailure?.user?.id).toBe('user-123');
    expect(provider.isAuthenticated()).toBe(true);
    // The transport failure must not broadcast a logout to subscribers —
    // that broadcast is what ejected signed-in users from the dashboard.
    expect(stateChanges.filter((session) => session === null)).toHaveLength(1); // only the initial subscribe callback
    errorSpy.mockRestore();
  });

  it('still clears the session when the server definitively reports signed-out', async () => {
    mockGetSession
      .mockResolvedValueOnce({ data: createBetterAuthSession() })
      .mockResolvedValueOnce({ data: { user: null, session: null } });

    const { BetterAuthProvider } = require('../../../../packages/auth/src/providers/better-auth');
    const provider = new BetterAuthProvider({ baseURL: 'https://api.hashpass.tech/api/auth' });
    const stateChanges: unknown[] = [];
    provider.onAuthStateChange((session: unknown) => stateChanges.push(session));

    await provider.getSession({ force: true });
    const afterSignedOutResponse = await provider.getSession({ force: true });

    expect(afterSignedOutResponse).toBeNull();
    expect(provider.isAuthenticated()).toBe(false);
    expect(stateChanges[stateChanges.length - 1]).toBeNull();
  });
});
