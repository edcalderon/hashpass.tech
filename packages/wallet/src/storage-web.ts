import type { VaultStore } from './storage';

const DATABASE = 'hashpass-wallet-v1';
const STORE = 'vault';

/** Only ciphertext is stored. IndexedDB transactions serialize compare-and-swap
 * across tabs. Storage denial/corruption is an error, never an empty wallet. */
export function createWebVaultStore(factory: IDBFactory = globalThis.indexedDB): VaultStore {
  async function open(): Promise<IDBDatabase> {
    if (!factory) throw new Error('secure_storage_unavailable');
    return new Promise((resolve, reject) => {
      let failed = false;
      const request = factory.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onerror = () => { failed = true; reject(new Error('vault_storage_failed')); };
      request.onblocked = () => { failed = true; reject(new Error('vault_storage_blocked')); };
      request.onsuccess = () => {
        if (failed) { request.result.close(); return; }
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    });
  }
  function transact<T>(db: IDBDatabase, mode: IDBTransactionMode,
    action: (store: IDBObjectStore, finish: (result: T) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      let result: T;
      transaction.oncomplete = () => { db.close(); resolve(result); };
      transaction.onabort = () => { db.close(); reject(new Error('vault_storage_failed')); };
      transaction.onerror = () => { /* onabort owns rejection and cleanup */ };
      try { action(transaction.objectStore(STORE), value => { result = value; }); }
      catch { transaction.abort(); }
    });
  }
  return {
    async read(key) {
      return transact<string | null>(await open(), 'readonly', (store, finish) => {
        const request = store.get(key);
        request.onsuccess = () => {
          if (request.result !== undefined && typeof request.result !== 'string') {
            store.transaction.abort(); return;
          }
          finish(request.result ?? null);
        };
      });
    },
    async compareAndSwap(key, expected, next) {
      return transact<boolean>(await open(), 'readwrite', (store, finish) => {
        const request = store.get(key);
        request.onsuccess = () => {
          if ((request.result ?? null) !== expected) { finish(false); return; }
          store.put(next, key);
          finish(true); // resolve only on transaction completion, not request success
        };
      });
    },
  };
}
