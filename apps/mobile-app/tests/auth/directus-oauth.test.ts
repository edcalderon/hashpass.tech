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
const mockDirectusApiClientCtor = jest.fn(() => ({
  logoutSession: mockLogoutSession,
  listAuthProviders: mockListAuthProviders,
  getCurrentUserWithToken: jest.fn(),
  getCurrentUserWithSession: jest.fn(),
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
});
