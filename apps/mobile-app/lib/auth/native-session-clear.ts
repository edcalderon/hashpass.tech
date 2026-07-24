import { Platform } from 'react-native';

type SecureStoreModule = typeof import('expo-secure-store');
type SecureStoreRuntimeModule = SecureStoreModule & { default?: SecureStoreModule };

const NATIVE_PROVIDER_SESSION_KEYS = [
  'hashpass_better_auth_session',
  'hashpass_directus_session',
] as const;

/**
 * Removes every provider-owned SecureStore cache that can restore a native
 * dashboard session. This intentionally runs independently of remote logout:
 * navigation and OS suspension must not be able to interrupt cache removal.
 */
export const clearPersistedNativeProviderSessions = async (): Promise<void> => {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    // Keep this lazy because Metro rewrites dynamic imports through Expo's
    // async-require helper in Android release bundles.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStoreModule = require('expo-secure-store') as SecureStoreRuntimeModule;
    const SecureStore = SecureStoreModule.default ?? SecureStoreModule;
    await Promise.all(
      NATIVE_PROVIDER_SESSION_KEYS.map((key) => SecureStore.deleteItemAsync(key)),
    );
  } catch (error) {
    console.warn('[auth] Failed to clear persisted native provider sessions during sign-out:', error);
  }
};
