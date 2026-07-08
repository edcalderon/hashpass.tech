/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

const mockGetItemAsync = jest.fn(async () => null);
const mockSetItemAsync = jest.fn(async () => undefined);
const mockDeleteItemAsync = jest.fn(async () => undefined);

jest.mock('expo-secure-store', () => ({
  getItemAsync: mockGetItemAsync,
  setItemAsync: mockSetItemAsync,
  deleteItemAsync: mockDeleteItemAsync,
}), { virtual: true });

jest.mock('@hashpass/config', () => ({
  ENV_CONFIG: {
    getApiUrl: jest.fn(() => 'https://api.hashpass.tech/api'),
  },
}));

const mockDirectusClient = {
  getCurrentUserWithSession: jest.fn(),
  refreshSessionWithCookies: jest.fn(),
  refreshSessionWithSessionCookies: jest.fn(),
  refreshToken: jest.fn(),
};

jest.mock('../../lib/auth/providers/directus-api-client', () => ({
  DirectusApiClient: jest.fn(() => mockDirectusClient),
}));

jest.mock('../../../../packages/auth/src/providers/directus-api-client', () => ({
  DirectusApiClient: jest.fn(() => mockDirectusClient),
}));

const nativeUser = {
  id: 'native-user',
  email: 'native@hashpass.tech',
  first_name: 'Native',
  last_name: 'User',
  role: 'user',
  status: 'active',
};

describe('Directus native secure storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItemAsync.mockResolvedValue(null);
  });

  it('stores app-local native sessions with lazy SecureStore require', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DirectusAuthProvider } = require('../../lib/auth/providers/directus');
    const provider = new DirectusAuthProvider('https://sso.hashpass.co');

    await (provider as any).storeSession(nativeUser, 1234567890);
    await (provider as any).clearStoredSession();

    expect(mockSetItemAsync).toHaveBeenCalledWith(
      'hashpass_directus_session',
      expect.stringContaining('"email":"native@hashpass.tech"')
    );
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('hashpass_directus_session');
  });

  it('stores workspace auth native sessions with lazy SecureStore require', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DirectusAuthProvider } = require('../../../../packages/auth/src/providers/directus');
    const provider = new DirectusAuthProvider('https://sso.hashpass.co');

    await (provider as any).storeSession(nativeUser, 1234567890);
    await (provider as any).clearStoredSession();

    expect(mockSetItemAsync).toHaveBeenCalledWith(
      'hashpass_directus_session',
      expect.stringContaining('"email":"native@hashpass.tech"')
    );
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('hashpass_directus_session');
  });
});
