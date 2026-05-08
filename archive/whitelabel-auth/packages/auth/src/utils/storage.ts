/**
 * Storage adapter implementations
 * @whitelabel/auth
 */

import type { StorageAdapter } from '../types/auth.js';

export class LocalStorageAdapter implements StorageAdapter {
  async getItem(key: string): Promise<string | null> {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  }

  async removeItem(key: string): Promise<void> {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  }
}

export class MemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.store.delete(key);
  }
}

// React Native storage adapters ( stubs - will be implemented in react-native.ts)
export class SecureStorageAdapter implements StorageAdapter {
  async getItem(_key: string): Promise<string | null> {
    throw new Error('SecureStore not available in web environment. Use @whitelabel/auth/react-native');
  }

  async setItem(_key: string, _value: string): Promise<void> {
    throw new Error('SecureStore not available in web environment. Use @whitelabel/auth/react-native');
  }

  async removeItem(_key: string): Promise<void> {
    throw new Error('SecureStore not available in web environment. Use @whitelabel/auth/react-native');
  }
}

export function createStorageAdapter(type: 'localStorage' | 'memory' | 'custom', customProvider?: StorageAdapter): StorageAdapter {
  switch (type) {
    case 'localStorage':
      return new LocalStorageAdapter();
    case 'memory':
      return new MemoryStorageAdapter();
    case 'custom':
      if (!customProvider) {
        throw new Error('Custom storage provider required when type is "custom"');
      }
      return customProvider;
    default:
      return new MemoryStorageAdapter();
  }
}
