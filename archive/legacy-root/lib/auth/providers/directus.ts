/**
 * Directus authentication provider implementation
 */

import { 
  IAuthProvider, 
  AuthUser, 
  AuthSession, 
  AuthResponse, 
  AuthStateChangeCallback,
  AuthProvider 
} from '../types';
import { Platform } from 'react-native';

export class DirectusAuthProvider implements IAuthProvider {
  private baseUrl: string;
  private session: AuthSession | null = null;
  private stateChangeCallbacks: AuthStateChangeCallback[] = [];
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(url: string) {
    this.baseUrl = url.replace(/\/$/, '');
    // Initialize session asynchronously to avoid blocking constructor
    this.initializeSession().catch(error => {
      console.error('Failed to initialize session:', error);
    });
  }

  getProviderName(): AuthProvider {
    return 'directus';
  }

  private async initializeSession(): Promise<void> {
    try {
      // Only initialize session in browser environment
      if (typeof window === 'undefined') {
        return;
      }
      
      const storedSession = await this.getStoredSession();
      if (storedSession) {
        this.session = storedSession;
        this.setupRefreshTimer();
        this.notifyStateChange(this.session);
      }
    } catch (error) {
      console.error('Failed to initialize session:', error);
    }
  }

  async signInWithEmailAndPassword(email: string, password: string): Promise<AuthResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { error: data.errors?.[0]?.message || 'Authentication failed' };
      }

      // Get user info
      const userResponse = await fetch(`${this.baseUrl}/users/me`, {
        headers: {
          'Authorization': `Bearer ${data.data.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      const userData = await userResponse.json();

      if (!userResponse.ok) {
        return { error: 'Failed to fetch user data' };
      }

      const user: AuthUser = {
        id: userData.data.id,
        email: userData.data.email,
        first_name: userData.data.first_name,
        last_name: userData.data.last_name,
        role: userData.data.role,
        status: userData.data.status,
        last_access: userData.data.last_access
      };

      const session: AuthSession = {
        user,
        access_token: data.data.access_token,
        refresh_token: data.data.refresh_token,
        expires_at: data.data.expires_at ? Date.now() + (data.data.expires * 1000) : undefined,
        provider: 'directus'
      };

      this.session = session;
      await this.storeSession(session);
      this.setupRefreshTimer();
      this.notifyStateChange(session);

      return { user, session };
    } catch (error) {
      console.error('Sign in error:', error);
      return { error: error instanceof Error ? error.message : 'Sign in failed' };
    }
  }

async signInWithOAuth(provider: 'google' | 'github' | 'facebook' | 'twitter'): Promise<AuthResponse> {
  try {
    if (Platform.OS === 'web') {
      // First check if OAuth is available on the server
      try {
        const oauthCheckResponse = await fetch(`${this.baseUrl}/auth`);
        if (!oauthCheckResponse.ok) {
          throw new Error(`OAuth not configured on server.`);
        }
        const authData = await oauthCheckResponse.json();
        const hasGoogleProvider = authData.data?.some((p: any) => p.name === provider);
        if (!hasGoogleProvider) {
          throw new Error(`${provider} provider not configured.`);
        }
      } catch (fetchError) {
        console.error('OAuth availability check failed:', fetchError);
        return { 
          error: `Google OAuth is not available on this server. Please contact the administrator to configure Google OAuth or use email/password authentication.`
        };
      }

      // For web, use our own API proxy to handle OAuth
      // This avoids cross-origin cookie issues by keeping everything server-side
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8081';
      const returnTo = window.localStorage?.getItem('oauth_return_url') || '/(shared)/dashboard/explore';
      
      // Use our proxy API to start OAuth
      const oauthUrl = `${currentOrigin}/api/auth/oauth/login?provider=${provider}&returnTo=${encodeURIComponent(returnTo)}`;
      
      console.log('🔐 Starting OAuth via proxy...');
      console.log('📍 OAuth URL:', oauthUrl);
      
      // Store return URL and redirect
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('oauth_return_url', window.location.pathname);
        window.location.href = oauthUrl;
      }
      
      // Return pending state since this is a redirect
      return { error: null, pending: true };
    } else {
      // For mobile, we'd need to implement deep linking or web view
      // For now, return error asking user to use web
      return { 
        error: 'OAuth authentication is currently only supported in web browsers. Please use the web app or email/password authentication.' 
      };
    }
  } catch (error) {
    console.error('OAuth sign in error:', error);
    return { error: error instanceof Error ? error.message : 'OAuth sign in failed' };
  }
}

async handleOAuthCallback(params: Record<string, string>): Promise<AuthResponse> {
  try {
    console.log('🔄 Processing Directus OAuth callback with params:', params);
    
    // First, let's try to see if there are any tokens or session info we can extract
    let authData: any = {};
    
    if (typeof window !== 'undefined') {
      // Check URL parameters and hash for any OAuth data
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      
      authData = {
        // Standard OAuth params
        access_token: params.access_token || urlParams.get('access_token') || hashParams.get('access_token'),
        token_type: params.token_type || urlParams.get('token_type') || hashParams.get('token_type'),
        expires_in: params.expires_in || urlParams.get('expires_in') || hashParams.get('expires_in'),
        expires: params.expires || urlParams.get('expires') || hashParams.get('expires'),
        scope: params.scope || urlParams.get('scope') || hashParams.get('scope'),
        state: params.state || urlParams.get('state') || hashParams.get('state'),
        // Additional possible params (Directus specific)
        code: params.code || urlParams.get('code'),
        session_token: params.session_token || urlParams.get('session_token'),
        user: params.user || urlParams.get('user'),
        // Check for Directus JSON mode tokens
        token: params.token || urlParams.get('token'), // Directus might pass token differently
        refresh_token: params.refresh_token || urlParams.get('refresh_token') || hashParams.get('refresh_token'),
        // Our OAuth proxy success flag
        oauth_success: params.oauth_success || urlParams.get('oauth_success') || hashParams.get('oauth_success'),
        user_id: params.user_id || urlParams.get('user_id') || hashParams.get('user_id'),
        email: params.email || urlParams.get('email') || hashParams.get('email')
      };
      
      console.log('📋 Extracted auth data:', authData);
      
      // Clear the hash to prevent re-processing
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }

    // Try using access token if available (either access_token or token)
    const token = authData.access_token || authData.token;
    if (token) {
      console.log('🔄 Found access token, attempting authentication...');
      console.log('🔍 Token details:', { 
        type: authData.access_token ? 'access_token' : 'token',
        length: token.length,
        prefix: token.substring(0, 20) + '...'
      });
      
      try {
        const userResponse = await fetch(`${this.baseUrl}/users/me`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        console.log('📡 Token auth response:', {
          status: userResponse.status,
          statusText: userResponse.statusText,
          url: userResponse.url
        });

        if (userResponse.ok) {
          const userData = await userResponse.json();
          console.log('✅ Token authentication successful:', userData.data?.email);

          if (userData.data) {
            const session: AuthSession = {
              user: {
                id: userData.data.id,
                email: userData.data.email,
                first_name: userData.data.first_name,
                last_name: userData.data.last_name,
                avatar: userData.data.avatar,
                role: userData.data.role
              },
              access_token: token,
              refresh_token: authData.refresh_token || null,
              expires_at: authData.expires_in ? Date.now() + (parseInt(authData.expires_in) * 1000) : undefined
            };

            this.session = session;
            await this.storeSession(session);
          
            console.log('🔔 Notifying auth state change (token-based)...');
            this.notifyStateChange(session);
            console.log('✅ Auth state change notification sent (token-based)');

            return { user: session.user, session: session };
          }
        } else {
          const errorText = await userResponse.text().catch(() => 'Unknown error');
          console.error('❌ Token authentication failed:', {
            status: userResponse.status,
            statusText: userResponse.statusText,
            error: errorText
          });
        }
      } catch (tokenError) {
        console.error('❌ Access token authentication failed:', tokenError);
      }
    }

    // If no access token, try cookie-based authentication
    // This should work if OAuth completed and set session cookies
    try {
      console.log('🔄 Attempting cookie-based authentication...');
      
      // Add a small delay to ensure any cookies are properly set
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const userResponse = await fetch(`${this.baseUrl}/users/me`, {
        method: 'GET',
        credentials: 'include', // Critical for cross-origin cookies
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      console.log('📡 Cookie auth response:', {
        status: userResponse.status,
        statusText: userResponse.statusText,
        url: userResponse.url,
        headers: {
          'Access-Control-Allow-Credentials': userResponse.headers.get('Access-Control-Allow-Credentials'),
          'Content-Type': userResponse.headers.get('Content-Type')
        }
      });

      if (userResponse.ok) {
        const userData = await userResponse.json();
        console.log('✅ Cookie authentication successful:', userData.data?.email);

        if (userData.data) {
          const session: AuthSession = {
            user: {
              id: userData.data.id,
              email: userData.data.email,
              first_name: userData.data.first_name,
              last_name: userData.data.last_name,
              avatar: userData.data.avatar,
              role: userData.data.role
            },
            access_token: 'session_based',
            refresh_token: null,
            expires_at: undefined
          };

          this.session = session;
          await this.storeSession(session);
          
          console.log('🔔 Notifying auth state change...');
          this.notifyStateChange(session);
          console.log('✅ Auth state change notification sent');

          return { user: session.user, session: session };
        }
      } else {
        console.error('❌ Session check failed:', userResponse.status, userResponse.statusText);
      }
    } catch (sessionError) {
      console.error('❌ Session check error:', sessionError);
    }

    // All authentication attempts failed
    return { 
      error: 'OAuth authentication completed but session could not be established. This may be due to cross-origin restrictions. Please try again or contact support.' 
    };
    
  } catch (error) {
    console.error('❌ OAuth callback error:', error);
    return { error: error instanceof Error ? error.message : 'OAuth callback failed' };
  }
}

async signOut(): Promise<{ error?: string }> {
  // If we have a session with access token, try to logout from server
  if (this.session?.access_token) {
    try {
      await fetch(`${this.baseUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }

  this.session = null;
  await this.clearStoredSession();
  this.clearRefreshTimer();
  this.notifyStateChange(null);

  return {};
}

  async getSession(): Promise<AuthSession | null> {
    // Return cached session if valid
    if (this.session && this.isTokenValid(this.session)) {
      return this.session;
    }

    // Try to refresh if we have a refresh token
    if (this.session?.refresh_token) {
      const refreshResult = await this.refreshSession();
      return refreshResult.session || null;
    }

    // For OAuth flows, try to check if there's an active server session
    // This handles cases where OAuth created a session but we don't have local tokens
    if (typeof window !== 'undefined') {
      try {
        const userResponse = await fetch(`${this.baseUrl}/users/me`, {
          method: 'GET',
          credentials: 'include', // Include cookies
          headers: {
            'Content-Type': 'application/json',
          }
        });

        if (userResponse.ok) {
          const userData = await userResponse.json();
          if (userData.data) {
            console.log('📡 Retrieved session from server via cookies');
            const session: AuthSession = {
              user: {
                id: userData.data.id,
                email: userData.data.email,
                first_name: userData.data.first_name,
                last_name: userData.data.last_name,
                avatar: userData.data.avatar,
                role: userData.data.role
              },
              access_token: 'oauth_session',
              refresh_token: null,
              expires_at: undefined
            };

            this.session = session;
            await this.storeSession(session);
            this.notifyStateChange(session);
            return session;
          }
        }
      } catch (error) {
        console.debug('No server session found:', error);
      }
    }

    return null;
  }

  async refreshSession(): Promise<AuthResponse> {
    if (!this.session?.refresh_token) {
      return { error: 'No refresh token available' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: this.session.refresh_token }),
      });

      const data = await response.json();

      if (!response.ok) {
        await this.signOut();
        return { error: data.errors?.[0]?.message || 'Token refresh failed' };
      }

      const updatedSession: AuthSession = {
        ...this.session,
        access_token: data.data.access_token,
        refresh_token: data.data.refresh_token || this.session.refresh_token,
        expires_at: data.data.expires ? Date.now() + (data.data.expires * 1000) : undefined
      };

      this.session = updatedSession;
      await this.storeSession(updatedSession);
      this.setupRefreshTimer();
      this.notifyStateChange(updatedSession);

      return { user: updatedSession.user, session: updatedSession };
    } catch (error) {
      console.error('Token refresh error:', error);
      await this.signOut();
      return { error: 'Token refresh failed' };
    }
  }

  isAuthenticated(): boolean {
    return this.session !== null && this.isTokenValid(this.session);
  }

  getUser(): AuthUser | null {
    return this.session?.user || null;
  }

  onAuthStateChange(callback: AuthStateChangeCallback): () => void {
    this.stateChangeCallbacks.push(callback);
    
    // Immediately call with current state
    callback(this.session);
    
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  // Private helper methods
  private isTokenValid(session: AuthSession): boolean {
    if (!session.expires_at) return true;
    return Date.now() < session.expires_at - 60000; // Refresh 1 minute before expiry
  }

  private notifyStateChange(session: AuthSession | null): void {
    this.stateChangeCallbacks.forEach(callback => {
      try {
        callback(session);
      } catch (error) {
        console.error('Auth state change callback error:', error);
      }
    });
  }

  private setupRefreshTimer(): void {
    this.clearRefreshTimer();
    
    if (this.session?.expires_at) {
      const refreshTime = this.session.expires_at - Date.now() - 60000; // Refresh 1 minute before expiry
      if (refreshTime > 0) {
        this.refreshTimer = setTimeout(() => {
          this.refreshSession();
        }, refreshTime);
      }
    }
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private async getStoredSession(): Promise<AuthSession | null> {
    try {
      const key = 'hashpass_directus_session';
      let stored: string | null = null;

      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        stored = localStorage.getItem(key);
      } else if (Platform.OS !== 'web') {
        // React Native
        const { SecureStore } = await import('expo-secure-store');
        stored = await SecureStore.getItemAsync(key);
      }

      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Error getting stored session:', error);
      return null;
    }
  }

  private async storeSession(session: AuthSession): Promise<void> {
    try {
      const key = 'hashpass_directus_session';
      const value = JSON.stringify(session);

      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(key, value);
      } else if (Platform.OS !== 'web') {
        // React Native
        const { SecureStore } = await import('expo-secure-store');
        await SecureStore.setItemAsync(key, value);
      }
    } catch (error) {
      console.error('Error storing session:', error);
    }
  }

  private async clearStoredSession(): Promise<void> {
    try {
      const key = 'hashpass_directus_session';

      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(key);
      } else if (Platform.OS !== 'web') {
        // React Native
        const { SecureStore } = await import('expo-secure-store');
        await SecureStore.deleteItemAsync(key);
      }
    } catch (error) {
      console.error('Error clearing stored session:', error);
    }
  }
}