import { Platform } from 'react-native';
import { LocalWallet, createNativeVaultStore, createWebVaultStore, type VaultScope } from '@hashpass/wallet';

/** One native JS runtime owns SecureStore wallet writes. No AsyncStorage fallback. */
export function createDeviceWallet(scope: VaultScope): LocalWallet {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !window.isSecureContext) throw new Error('secure_context_required');
    return new LocalWallet(scope, createWebVaultStore());
  }
  // Lazy native imports keep platform-specific crypto/storage out of web paths.
  const secureStore = require('expo-secure-store') as typeof import('expo-secure-store');
  const crypto = require('expo-crypto') as typeof import('expo-crypto');
  const options = { keychainAccessible: secureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  return new LocalWallet(scope, createNativeVaultStore({
    available: () => secureStore.isAvailableAsync(),
    read: key => secureStore.getItemAsync(key, options),
    write: (key, value) => secureStore.setItemAsync(key, value, options),
  }), size => crypto.getRandomValues(new Uint8Array(size)));
}

export function walletRandom(size: number): Uint8Array {
  if (Platform.OS === 'web') return globalThis.crypto.getRandomValues(new Uint8Array(size));
  return (require('expo-crypto') as typeof import('expo-crypto')).getRandomValues(new Uint8Array(size));
}
export function walletOperationId(): string {
  if (Platform.OS === 'web') return globalThis.crypto.randomUUID();
  return (require('expo-crypto') as typeof import('expo-crypto')).randomUUID();
}
