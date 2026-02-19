import { Platform } from 'react-native';

// Directus SSO Configuration
const DIRECTUS_URL = 'https://sso.hashpass.co';

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
  // For native (iOS, Android), use AsyncStorage
  let asyncStorage: any = null;
  const loadAsyncStorage = async () => {
    if (!asyncStorage) {
      try {
        const AsyncStorage = await import('@react-native-async-storage/async-storage');
        asyncStorage = AsyncStorage.default;
      } catch (error) {
        console.error('Failed to load AsyncStorage:', error);
        // Fallback to dummy storage
        asyncStorage = {
          getItem: async () => null,
          setItem: async () => {},
          removeItem: async () => {},
        };
      }
    }
    return asyncStorage;
  };
  
  storage = {
    getItem: async (key: string) => {
      const AsyncStorage = await loadAsyncStorage();
      return await AsyncStorage.getItem(key);
    },
    setItem: async (key: string, value: string) => {
      const AsyncStorage = await loadAsyncStorage();
      return await AsyncStorage.setItem(key, value);
    },
    removeItem: async (key: string) => {
      const AsyncStorage = await loadAsyncStorage();
      return await AsyncStorage.removeItem(key);
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
  private session: DirectusSession | null = null;
  private listeners: Array<(session: DirectusSession | null) => void> = [];

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
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
      const response = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.statusText}`);
      }

      const data: DirectusAuthResponse = await response.json();
      
      // Get user info
      const userResponse = await fetch(`${this.baseUrl}/users/me`, {
        headers: {
          'Authorization': `Bearer ${data.data.access_token}`,
        },
      });

      if (!userResponse.ok) {
        throw new Error('Failed to get user info');
      }

      const userData = await userResponse.json();
      
      this.session = {
        access_token: data.data.access_token,
        refresh_token: data.data.refresh_token,
        expires: Date.now() + data.data.expires,
        user: userData.data,
      };

      await storage.setItem('directus_session', JSON.stringify(this.session));
      this.notifyListeners();

      return data;
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  }

  async signOut(): Promise<void> {
    try {
      if (this.session) {
        // Revoke the token on server
        await fetch(`${this.baseUrl}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.session.access_token}`,
          },
        });
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

      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refresh_token: this.session.refresh_token,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to refresh token');
      }

      const data: DirectusAuthResponse = await response.json();
      
      // Get updated user info
      const userResponse = await fetch(`${this.baseUrl}/users/me`, {
        headers: {
          'Authorization': `Bearer ${data.data.access_token}`,
        },
      });

      if (userResponse.ok) {
        const userData = await userResponse.json();
        this.session = {
          access_token: data.data.access_token,
          refresh_token: data.data.refresh_token,
          expires: Date.now() + data.data.expires,
          user: userData.data,
        };
      } else {
        // Keep the old user data if we can't fetch new info
        this.session = {
          ...this.session,
          access_token: data.data.access_token,
          refresh_token: data.data.refresh_token,
          expires: Date.now() + data.data.expires,
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