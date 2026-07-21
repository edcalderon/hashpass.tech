/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

const mockLogoutSession = jest.fn(async () => ({ data: null, error: null }));
const mockListAuthProviders = jest.fn(async () => ({ data: [], error: null }));
const mockGetCurrentUserWithToken = jest.fn();
const mockGetCurrentUserWithSession = jest.fn();
const mockDirectusApiClientCtor = jest.fn(() => ({
  logoutSession: mockLogoutSession,
  listAuthProviders: mockListAuthProviders,
  getCurrentUserWithToken: mockGetCurrentUserWithToken,
  getCurrentUserWithSession: mockGetCurrentUserWithSession,
  refreshSessionWithCookies: jest.fn(),
  refreshSessionWithSessionCookies: jest.fn(),
  logoutWithToken: jest.fn(),
  refreshToken: jest.fn(),
}));

jest.mock('../../../../packages/auth/src/providers/directus-api-client', () => ({
  DirectusApiClient: mockDirectusApiClientCtor,
}));

jest.mock('@hashpass/config', () => ({
  ENV_CONFIG: {
    getApiUrl: jest.fn(() => 'https://api.hashpass.tech/api'),
  },
}));

/* eslint-disable @typescript-eslint/no-require-imports */

const localStorageMock = {
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};

const locationMock = {
  origin: 'https://hashpass.tech',
  pathname: '/auth',
  href: 'https://hashpass.tech/auth',
  search: '',
  hash: '',
};

beforeEach(() => {
  jest.resetModules();
  mockLogoutSession.mockClear();
  mockListAuthProviders.mockClear();
  mockGetCurrentUserWithToken.mockClear();
  mockGetCurrentUserWithSession.mockClear();
  mockDirectusApiClientCtor.mockClear();

  locationMock.pathname = '/auth';
  locationMock.href = 'https://hashpass.tech/auth';

  (globalThis as Record<string, unknown>).window = {
    localStorage: localStorageMock,
    location: locationMock,
    history: {
      replaceState: jest.fn(),
    },
  };
  (globalThis as Record<string, unknown>).localStorage = localStorageMock;
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).localStorage;
});

describe('Directus OAuth sign-in', () => {
  it('starts Google OAuth through the API bridge without preflighting Directus providers', async () => {
    const { DirectusAuthProvider } = require('../../../../packages/auth/src/providers/directus');

    const provider = new DirectusAuthProvider('https://sso.hashpass.co');
    const result = await provider.signInWithOAuth('google');

    expect(result).toEqual({ pending: true });
    expect(mockListAuthProviders).not.toHaveBeenCalled();
    expect(locationMock.href).toBe(
      'https://api.hashpass.tech/api/auth/oauth/login?provider=google&returnTo=%2Fdashboard%2Fexplore'
    );
  });

  it('returns explicit OAuth errors from native callback URLs', async () => {
    const { DirectusAuthProvider } = require('../../../../packages/auth/src/providers/directus');

    const provider = new DirectusAuthProvider('https://sso.hashpass.co');
    const result = await provider.handleOAuthCallback({
      error: 'oauth_failed',
      message: 'Native auth failed',
    });

    expect(result).toEqual({ error: 'Native auth failed' });
  });

  it('does not probe Directus cookies on a normal web page load', async () => {
    const { DirectusAuthProvider } = require('../../../../packages/auth/src/providers/directus');

    const provider = new DirectusAuthProvider('https://sso.hashpass.co');
    const session = await provider.getSession();

    expect(session).toBeNull();
    expect(mockGetCurrentUserWithSession).not.toHaveBeenCalled();
  });

  it('does not probe Directus cookies on the shared /auth/callback route when no Directus OAuth is in progress', async () => {
    // Regression for: this probe used to fire unconditionally whenever the
    // pathname included '/auth/callback' — but that route is shared by every
    // auth method, including Supabase magic-link and OTP verification, which
    // have nothing to do with Directus. That produced a CORS failure against
    // the Directus SSO host (sso.hashpass.co) on every single magic-link
    // callback in production. Only `oauth_in_progress` (set by Directus's own
    // initiateOAuth or Better Auth's Google flow) should unlock this probe.
    locationMock.pathname = '/auth/callback';
    locationMock.href = 'https://hashpass.tech/auth/callback?code=abc123';
    localStorageMock.getItem.mockReturnValue(null); // oauth_in_progress not set

    const { DirectusAuthProvider } = require('../../../../packages/auth/src/providers/directus');

    const provider = new DirectusAuthProvider('https://sso.hashpass.co');
    const session = await provider.getSession();

    expect(session).toBeNull();
    expect(mockGetCurrentUserWithSession).not.toHaveBeenCalled();
  });

  it('does probe Directus cookies on /auth/callback when a Directus OAuth handoff is actually in progress', async () => {
    locationMock.pathname = '/auth/callback';
    locationMock.href = 'https://hashpass.tech/auth/callback?oauth_success=1';
    (localStorageMock.getItem as jest.Mock).mockImplementation((key: string) =>
      key === 'oauth_in_progress' ? 'true' : null
    );
    mockGetCurrentUserWithSession.mockResolvedValue({ data: null, error: { message: 'no session' } });

    const { DirectusAuthProvider } = require('../../../../packages/auth/src/providers/directus');

    const provider = new DirectusAuthProvider('https://sso.hashpass.co');
    await provider.getSession();

    expect(mockGetCurrentUserWithSession).toHaveBeenCalled();
  });

  it('uses Directus user payload from the OAuth callback instead of calling /users/me', async () => {
    const { DirectusAuthProvider } = require('../../../../packages/auth/src/providers/directus');

    const provider = new DirectusAuthProvider('https://sso.hashpass.co');
    const directusUser = {
      id: 'directus-user-123',
      email: 'ada@hashpass.tech',
      first_name: 'Ada',
      last_name: 'Lovelace',
      status: 'active',
    };

    const result = await provider.handleOAuthCallback({
      access_token: 'access123',
      refresh_token: 'refresh456',
      directus_user: JSON.stringify(directusUser),
    });

    expect(result.error).toBeUndefined();
    expect(result.session?.user.email).toBe('ada@hashpass.tech');
    expect(mockGetCurrentUserWithToken).not.toHaveBeenCalled();
    expect(mockGetCurrentUserWithSession).not.toHaveBeenCalled();
  });
});
