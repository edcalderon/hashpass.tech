import { Platform } from 'react-native';
import { DirectusApiClient } from './providers/directus-api-client';

// Directus SSO Configuration
const DIRECTUS_URL =
  process.env.EXPO_PUBLIC_DIRECTUS_URL ||
  process.env.DIRECTUS_URL ||
  'https://sso.hashpass.co';

// Storage configuration for different platforms
let storage: any;

if (Platform.OS === 'web') {
  // For web, use localStorage if window is defined (client-side browser)
  storage = typeof window !== 'undefined' ? window.localStorage : {
    getItem: async (key: string) => null,
    setItem: async (key: string, value: string) => {},
    removeItem: async (key: string) => {},
  };
} else {
  // For native (iOS, Android), use SecureStore (Keychain/Keystore-backed,
  // encrypted at rest) instead of AsyncStorage (plaintext) -- this session
  // includes a live access_token/refresh_token. Matches the pattern already
  // proven in apps/mobile-app/lib/auth/providers/directus.ts. Keep lazy
  // without dynamic import(), which Metro rewrites through Expo's
  // async-require helper -- not available in the current Android release
  // bundle toolchain.
  let secureStore: any = null;
  const loadSecureStore = async () => {
    if (!secureStore) {
      try {
        secureStore = require('expo-secure-store');
      } catch (error) {
        console.error('Failed to load SecureStore:', error);
        // Fallback to dummy storage
        secureStore = {
          getItemAsync: async () => null,
          setItemAsync: async () => {},
          deleteItemAsync: async () => {},
        };
      }
    }
    return secureStore;
  };

  // Kept only to migrate/purge sessions written by pre-SecureStore app
  // versions -- never used for new writes. Without this, a user upgrading
  // from an older build would (a) look silently signed out, since reads now
  // only check SecureStore, and (b) keep their old plaintext access/refresh
  // tokens sitting in AsyncStorage indefinitely, even after a later
  // sign-out, since removeItem previously only ever touched one store.
  let legacyAsyncStorage: any = null;
  const loadLegacyAsyncStorage = async () => {
    if (!legacyAsyncStorage) {
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage');
        legacyAsyncStorage = AsyncStorage.default ?? AsyncStorage;
      } catch {
        legacyAsyncStorage = { getItem: async () => null, removeItem: async () => {} };
      }
    }
    return legacyAsyncStorage;
  };

  storage = {
    getItem: async (key: string) => {
      const SecureStore = await loadSecureStore();
      const current = await SecureStore.getItemAsync(key);
      if (current !== null && current !== undefined) {
        return current;
      }

      // One-time migration: a legacy plaintext value from before this
      // switch. Move it into SecureStore and purge the old copy so it
      // doesn't linger in cleartext.
      const AsyncStorage = await loadLegacyAsyncStorage();
      const legacyValue = await AsyncStorage.getItem(key);
      if (legacyValue !== null && legacyValue !== undefined) {
        await SecureStore.setItemAsync(key, legacyValue);
        await AsyncStorage.removeItem(key);
        return legacyValue;
      }

      return null;
    },
    setItem: async (key: string, value: string) => {
      const SecureStore = await loadSecureStore();
      return await SecureStore.setItemAsync(key, value);
    },
    removeItem: async (key: string) => {
      const SecureStore = await loadSecureStore();
      await SecureStore.deleteItemAsync(key);
      // Purge any leftover legacy copy too, regardless of whether the
      // migration above ever ran for this key.
      const AsyncStorage = await loadLegacyAsyncStorage();
      await AsyncStorage.removeItem(key);
    }
  };
}

export interface DirectusUser {
  id: string;
  first_name?: string;
  last_name?: string;
  email: string;
  role?: string;
  status: string;
  last_access?: string;
  avatar?: string;
  [key: string]: any;
}

export interface DirectusSession {
  access_token: string;
  refresh_token: string;
  expires: number;
  user: DirectusUser;
}

export interface DirectusAuthResponse {
  data: {
    access_token: string;
    refresh_token: string;
    expires: number;
  };
}

class DirectusAuth {
  private baseUrl: string;
  private apiClient: DirectusApiClient;
  private session: DirectusSession | null = null;
  private listeners: Array<(session: DirectusSession | null) => void> = [];

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.apiClient = new DirectusApiClient(this.baseUrl);
    this.initializeSession();
  }

  private async initializeSession() {
    try {
      const storedSession = await storage.getItem('directus_session');
      if (storedSession) {
        const session: DirectusSession = JSON.parse(storedSession);
        // Check if session is still valid
        if (session.expires > Date.now()) {
          this.session = session;
          this.notifyListeners();
        } else {
          // Try to refresh the session
          await this.refreshSession();
        }
      }
    } catch (error) {
      console.error('Failed to initialize session:', error);
    }
  }

  async signIn(email: string, password: string): Promise<DirectusAuthResponse> {
    try {
      const loginResult = await this.apiClient.signInWithPassword(email, password);
      if (loginResult.error || !loginResult.data?.access_token) {
        throw new Error(loginResult.error?.message || 'Authentication failed');
      }

      const userResult = await this.apiClient.getCurrentUserWithToken(loginResult.data.access_token);
      if (userResult.error || !userResult.data) {
        throw new Error(userResult.error?.message || 'Failed to get user info');
      }
      
      this.session = {
        access_token: loginResult.data.access_token,
        refresh_token: loginResult.data.refresh_token || '',
        expires: Date.now() + (loginResult.data.expires || 0),
        user: userResult.data as DirectusUser,
      };

      await storage.setItem('directus_session', JSON.stringify(this.session));
      this.notifyListeners();

      return {
        data: {
          access_token: loginResult.data.access_token,
          refresh_token: loginResult.data.refresh_token || '',
          expires: loginResult.data.expires || 0,
        },
      };
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  }

  async signOut(): Promise<void> {
    try {
      if (this.session) {
        await this.apiClient.logoutWithToken(this.session.access_token);
      }
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      this.session = null;
      await storage.removeItem('directus_session');
      this.notifyListeners();
    }
  }

  async refreshSession(): Promise<void> {
    try {
      if (!this.session?.refresh_token) {
        throw new Error('No refresh token available');
      }

      const refreshResult = await this.apiClient.refreshToken(this.session.refresh_token);
      if (refreshResult.error || !refreshResult.data?.access_token) {
        throw new Error(refreshResult.error?.message || 'Failed to refresh token');
      }
      
      // Get updated user info
      const userResult = await this.apiClient.getCurrentUserWithToken(refreshResult.data.access_token);

      if (userResult.data) {
        this.session = {
          access_token: refreshResult.data.access_token,
          refresh_token: refreshResult.data.refresh_token || this.session.refresh_token,
          expires: Date.now() + (refreshResult.data.expires || 0),
          user: userResult.data as DirectusUser,
        };
      } else {
        // Keep the old user data if we can't fetch new info
        this.session = {
          ...this.session,
          access_token: refreshResult.data.access_token,
          refresh_token: refreshResult.data.refresh_token || this.session.refresh_token,
          expires: Date.now() + (refreshResult.data.expires || 0),
        };
      }

      await storage.setItem('directus_session', JSON.stringify(this.session));
      this.notifyListeners();
    } catch (error) {
      console.error('Refresh session error:', error);
      // If refresh fails, clear the session
      this.session = null;
      await storage.removeItem('directus_session');
      this.notifyListeners();
      throw error;
    }
  }

  getSession(): DirectusSession | null {
    return this.session;
  }

  getUser(): DirectusUser | null {
    return this.session?.user || null;
  }

  isAuthenticated(): boolean {
    return !!(this.session && this.session.expires > Date.now());
  }

  onAuthStateChange(callback: (session: DirectusSession | null) => void): () => void {
    this.listeners.push(callback);
    // Call immediately with current state
    callback(this.session);
    
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this.session);
      } catch (error) {
        console.error('Auth state listener error:', error);
      }
    });
  }

  async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.session) {
      throw new Error('Not authenticated');
    }

    // Check if token is expired and refresh if needed
    if (this.session.expires <= Date.now()) {
      await this.refreshSession();
    }

    return fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.session.access_token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  }
}

// Initialize the Directus auth client
const directusAuth = new DirectusAuth(DIRECTUS_URL);

export { directusAuth };
export default directusAuth;
