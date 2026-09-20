import { Platform } from 'react-native';
const mockAvailable = jest.fn();
const mockRead = jest.fn();
const mockWrite = jest.fn();
const mockRandom = jest.fn((bytes: Uint8Array) => bytes.fill(7));
let mockKeychain: any;
const mockWebStore = {};
jest.mock('expo-secure-store', () => ({
  isAvailableAsync: () => mockAvailable(),
  getItemAsync: (...args: any[]) => mockRead(...args),
  setItemAsync: (...args: any[]) => mockWrite(...args),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 42,
}));
jest.mock('expo-crypto', () => ({ getRandomValues: (bytes: Uint8Array) => mockRandom(bytes) }));
jest.mock('@hashpass/wallet', () => ({
  LocalWallet: class {
    random: unknown;
    constructor(_scope: unknown, _store: unknown, random?: (n: number) => Uint8Array) { this.random = random; }
  },
  createWebVaultStore: () => mockWebStore,
  createNativeVaultStore: (adapter: unknown) => { mockKeychain = adapter; return adapter; },
}));
import { createDeviceWallet } from '../../lib/wallet/device-wallet';
const scope = { environment: 'development' as const, ownerId: 'user-a', walletId: 'wallet-a' };

afterEach(() => { (Platform as any).OS = 'web'; jest.clearAllMocks(); });
it('refuses web vault initialization outside a secure browser context', () => {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
  expect(() => createDeviceWallet(scope)).toThrow('secure_context_required');
});
it('uses device-only unlocked Keychain access and native entropy', async () => {
  (Platform as any).OS = 'ios';
  const wallet = createDeviceWallet(scope) as any;
  await mockKeychain.read('key');
  await mockKeychain.write('key', 'ciphertext');
  expect(mockRead).toHaveBeenCalledWith('key', { keychainAccessible: 42 });
  expect(mockWrite).toHaveBeenCalledWith('key', 'ciphertext', { keychainAccessible: 42 });
  expect(wallet.random(32)).toHaveLength(32);
  expect(mockRandom).toHaveBeenCalledTimes(1);
});
