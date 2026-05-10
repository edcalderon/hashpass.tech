/**
 * React Native SecureStore adapter
 * @whitelabel/auth/react-native
 */

import type { StorageAdapter } from '../types/auth.js';

// This is a stub implementation - in real usage, expo-secure-store would be dynamically imported
export class SecureStorageAdapter implements StorageAdapter {
  async getItem(_key: string): Promise<string | null> {
    // In production, this would use expo-secure-store
    // const SecureStore = await import('expo-secure-store');
    // return await SecureStore.getItemAsync(key);
    throw new Error('expo-secure-store not installed. Run: npm install expo-secure-store');
  }

  async setItem(_key: string, _value: string): Promise<void> {
    // In production, this would use expo-secure-store
    // const SecureStore = await import('expo-secure-store');
    // await SecureStore.setItemAsync(key, value);
    throw new Error('expo-secure-store not installed. Run: npm install expo-secure-store');
  }

  async removeItem(_key: string): Promise<void> {
    // In production, this would use expo-secure-store
    // const SecureStore = await import('expo-secure-store');
    // await SecureStore.deleteItemAsync(key);
    throw new Error('expo-secure-store not installed. Run: npm install expo-secure-store');
  }
}

// AsyncStorage adapter for React Native (less secure but more compatible)
export class AsyncStorageAdapter implements StorageAdapter {
  private storage: Record<string, string> = {};

  async getItem(key: string): Promise<string | null> {
    return this.storage[key] || null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.storage[key] = value;
  }

  async removeItem(key: string): Promise<void> {
    delete this.storage[key];
  }
}
