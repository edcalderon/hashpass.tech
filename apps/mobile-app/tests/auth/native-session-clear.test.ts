/// <reference types="jest" />

const mockPlatform = { OS: 'android' };
const mockDeleteItemAsync = jest.fn<Promise<void>, [string]>(async () => undefined);

jest.mock('react-native', () => ({
  Platform: mockPlatform,
}));

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: mockDeleteItemAsync,
}), { virtual: true });

describe('clearPersistedNativeProviderSessions', () => {
  beforeEach(() => {
    mockPlatform.OS = 'android';
    mockDeleteItemAsync.mockClear();
  });

  it('removes Better Auth and Directus caches before navigation can restore a session', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { clearPersistedNativeProviderSessions } = require('../../lib/auth/native-session-clear');

    await clearPersistedNativeProviderSessions();

    expect(mockDeleteItemAsync).toHaveBeenCalledWith('hashpass_better_auth_session');
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('hashpass_directus_session');
  });

  it('does not access SecureStore on web', async () => {
    mockPlatform.OS = 'web';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { clearPersistedNativeProviderSessions } = require('../../lib/auth/native-session-clear');

    await clearPersistedNativeProviderSessions();

    expect(mockDeleteItemAsync).not.toHaveBeenCalled();
  });
});
