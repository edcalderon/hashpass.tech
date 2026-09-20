import type { VaultStore } from './storage';
export interface NativeKeychain {
  available(): Promise<boolean>;
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
}
// Shared across adapter instances in this JS runtime. Native integrations must
// route all wallet writes through this module, with no headless/extension writer.
let writeTail: Promise<unknown> = Promise.resolve();

export function createNativeVaultStore(keychain: NativeKeychain): VaultStore {
  const requireStorage = async () => {
    if (!await keychain.available()) throw new Error('secure_storage_unavailable');
  };
  return {
    async read(key) { await requireStorage(); return keychain.read(key); },
    compareAndSwap(key, expected, next) {
      const operation = writeTail.then(async () => {
        await requireStorage();
        if (await keychain.read(key) !== expected) return false;
        await keychain.write(key, next);
        // Treat a failed read-back as an uncertain write; do not delete/retry
        // automatically because the encrypted seed may already be durable.
        if (await keychain.read(key) !== next) throw new Error('vault_write_unconfirmed');
        return true;
      });
      writeTail = operation.catch(() => undefined);
      return operation;
    },
  };
}
