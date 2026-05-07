/**
 * Directus authentication provider
 * @whitelabel/auth
 */

import { BaseAuthProvider } from '../base/BaseAuthProvider.js';
import type { User, Session, AuthResult, OAuthProvider, StorageAdapter } from '../../types/auth.js';
import type { DirectusConfig } from '../../types/config.js';
import { ProviderError } from '../../types/auth.js';

interface DirectusUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  avatar?: string;
  role?: string;
  status?: string;
  provider?: string;
  external_identifier?: string;
  auth_data?: Record<string, unknown>;
  [key: string]: unknown;
}

interface DirectusAuthResponse {
  data?: {
    access_token: string;
    refresh_token?: string;
    expires?: number;
    id?: string;
  };
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

export class DirectusProvider extends BaseAuthProvider {
  readonly name = 'directus' as const;
  private baseUrl: string;
  private staticToken?: string;
  private config: DirectusConfig;
  private currentSession: Session | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: DirectusConfig, storage: StorageAdapter) {
    super(storage);
    this.baseUrl = config.url.replace(/\/$/, '');
    this.staticToken = config.staticToken;
    this.config = config;
    this.initializeSession();
  }

  private async initializeSession(): Promise<void> {
    try {
      const storedSession = await this.getStoredSession();
      if (storedSession && storedSession.provider === 'directus') {
        this.currentSession = storedSession;
        this.setupRefreshTimer();
        this.notifyStateChange({
          user: storedSession.user,
          session: storedSession,
          isAuthenticated: true,
        });
      }
    } catch (error) {
      console.error('Failed to initialize Directus session:', error);
    }
  }

  async signInWithEmailAndPassword(email: string, password: string): Promise<AuthResult> {
    try {
      const response = await this.fetchDirectus('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }) as DirectusAuthResponse;

      if (response.errors) {
        return { 
          error: new ProviderError(
            response.errors[0]?.message || 'Login failed', 
            'directus'
          ) 
        };
      }

      if (!response.data?.access_token) {
        return { error: new ProviderError('No access token received', 'directus') };
      }

      // Get user info
      const userResponse = await this.fetchDirectus('/users/me', {
        headers: {
          'Authorization': `Bearer ${response.data.access_token}`,
        },
      });

      if (userResponse.errors || !userResponse.data) {
        return { error: new ProviderError('Failed to get user info', 'directus') };
      }

      const user = this.mapDirectusUser(userResponse.data as DirectusUser);
      const session = this.createSession(
        user,
        response.data.access_token,
        response.data.refresh_token,
        response.data.expires
      );

      this.currentSession = session;
      await this.storeSession(session);
      this.setupRefreshTimer();
      this.notifyStateChange({ user, session, isAuthenticated: true });

      return { user, session };
    } catch (error) {
      return {
        error: new ProviderError(
          error instanceof Error ? error.message : 'Login failed',
          'directus'
        ),
      };
    }
  }

  async signInWithOAuth(provider: OAuthProvider): Promise<AuthResult> {
    try {
      // Check if provider is available
      const providersResponse = await this.fetchDirectus('/auth/providers') as { data?: Array<{ name: string }>; errors?: Array<{ message: string }> };
      
      if (providersResponse.errors) {
        return { 
          error: new ProviderError(
            'Failed to get auth providers',
            'directus'
          ) 
        };
      }

      const availableProviders = providersResponse.data || [];
      const hasProvider = availableProviders.some((p) => p.name === provider);
      
      if (!hasProvider) {
        return { 
          error: new ProviderError(
            `${provider} OAuth not configured in Directus`,
            'directus'
          ) 
        };
      }

      // Build OAuth URL
      const returnTo = this.config.oauth.redirectUrl;
      const oauthUrl = `${this.baseUrl}/auth/login/${provider}?redirect=${encodeURIComponent(returnTo)}`;

      // For web, redirect to OAuth
      if (typeof window !== 'undefined') {
        window.location.href = oauthUrl;
        return { pending: true };
      }

      return { 
        error: new ProviderError(
          'OAuth requires browser environment',
          'directus'
        ) 
      };
    } catch (error) {
      return {
        error: new ProviderError(
          error instanceof Error ? error.message : 'OAuth initialization failed',
          'directus'
        ),
      };
    }
  }

  async handleOAuthCallback(params: Record<string, string>): Promise<AuthResult> {
    try {
      // Try to get tokens from URL params
      const accessToken = params.access_token || params.token;
      const refreshToken = params.refresh_token;
      const expiresIn = params.expires_in || params.expires;

      if (!accessToken) {
        // Try session-based auth (cookie)
        const userResponse = await this.fetchDirectus('/users/me', {
          credentials: 'include',
        });

        if (userResponse.errors || !userResponse.data) {
          return { 
            error: new ProviderError(
              'No access token or session found',
              'directus'
            ) 
          };
        }

        const user = this.mapDirectusUser(userResponse.data as DirectusUser);
        const session = this.createSession(user, 'session_based', undefined, undefined);
        
        this.currentSession = session;
        await this.storeSession(session);
        this.notifyStateChange({ user, session, isAuthenticated: true });

        return { user, session };
      }

      // Get user info with token
      const userResponse = await this.fetchDirectus('/users/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (userResponse.errors || !userResponse.data) {
        return { error: new ProviderError('Failed to get user info', 'directus') };
      }

      const user = this.mapDirectusUser(userResponse.data as DirectusUser);
      const expires = expiresIn ? parseInt(expiresIn, 10) : undefined;
      const session = this.createSession(user, accessToken, refreshToken, expires);

      this.currentSession = session;
      await this.storeSession(session);
      this.setupRefreshTimer();
      this.notifyStateChange({ user, session, isAuthenticated: true });

      return { user, session };
    } catch (error) {
      return {
        error: new ProviderError(
          error instanceof Error ? error.message : 'OAuth callback failed',
          'directus'
        ),
      };
    }
  }

  async getSession(): Promise<Session | null> {
    if (this.currentSession) {
      return this.currentSession;
    }

    try {
      const storedSession = await this.getStoredSession();
      if (storedSession && storedSession.provider === 'directus') {
        this.currentSession = storedSession;
        return storedSession;
      }
      return null;
    } catch {
      return null;
    }
  }

  async refreshSession(): Promise<AuthResult> {
    try {
      if (!this.currentSession?.refreshToken) {
        return { error: new ProviderError('No refresh token available', 'directus') };
      }

      const response = await this.fetchDirectus('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({
          refresh_token: this.currentSession.refreshToken,
        }),
      }) as DirectusAuthResponse;

      if (response.errors) {
        return { 
          error: new ProviderError(
            response.errors[0]?.message || 'Token refresh failed',
            'directus'
          ) 
        };
      }

      if (!response.data?.access_token) {
        return { error: new ProviderError('No access token after refresh', 'directus') };
      }

      const user = this.currentSession.user;
      const session = this.createSession(
        user,
        response.data.access_token,
        response.data.refresh_token || this.currentSession.refreshToken,
        response.data.expires
      );

      this.currentSession = session;
      await this.storeSession(session);
      this.setupRefreshTimer();

      return { user, session };
    } catch (error) {
      return {
        error: new ProviderError(
          error instanceof Error ? error.message : 'Session refresh failed',
          'directus'
        ),
      };
    }
  }

  async signOut(): Promise<void> {
    try {
      if (this.currentSession?.accessToken && this.currentSession.accessToken !== 'session_based') {
        await this.fetchDirectus('/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.currentSession.accessToken}`,
          },
        });
      }
    } catch (error) {
      console.error('Directus logout error:', error);
    } finally {
      this.currentSession = null;
      await this.clearStoredSession();
      this.clearRefreshTimer();
      this.notifyStateChange({
        user: null,
        session: null,
        isAuthenticated: false,
      });
    }
  }

  isAuthenticated(): boolean {
    return this.currentSession !== null;
  }

  getUser(): User | null {
    return this.currentSession?.user || null;
  }

  // Helper methods for sync
  async getUserById(userId: string): Promise<User | null> {
    try {
      const response = await this.fetchDirectus(`/users/${userId}`, {
        headers: this.staticToken ? {
          'Authorization': `Bearer ${this.staticToken}`,
        } : {},
      });

      if (response.errors || !response.data) {
        return null;
      }

      return this.mapDirectusUser(response.data as DirectusUser);
    } catch {
      return null;
    }
  }

  async createOrUpdateUser(userData: Partial<DirectusUser>): Promise<User | null> {
    try {
      const response = await this.fetchDirectus('/users', {
        method: 'POST',
        headers: this.staticToken ? {
          'Authorization': `Bearer ${this.staticToken}`,
          'Content-Type': 'application/json',
        } : {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      if (response.errors || !response.data) {
        return null;
      }

      return this.mapDirectusUser(response.data as DirectusUser);
    } catch {
      return null;
    }
  }

  private async fetchDirectus(endpoint: string, options: RequestInit = {}): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    return response.json();
  }

  private mapDirectusUser(user: DirectusUser): User {
    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      avatar: user.avatar,
      role: user.role,
      status: (user.status as 'active' | 'inactive' | 'pending') || 'active',
      userMetadata: {
        provider: user.provider,
        externalIdentifier: user.external_identifier,
        authData: user.auth_data,
        ...user,
      },
      directusId: user.id,
    };
  }

  private createSession(
    user: User,
    accessToken: string,
    refreshToken?: string,
    expires?: number
  ): Session {
    return {
      user,
      accessToken,
      refreshToken,
      expiresAt: expires ? Date.now() + (expires * 1000) : undefined,
      provider: 'directus',
      directusSession: {
        accessToken,
        refreshToken,
        expiresAt: expires ? Date.now() + (expires * 1000) : undefined,
      },
    };
  }

  private setupRefreshTimer(): void {
    this.clearRefreshTimer();
    
    if (this.currentSession?.expiresAt) {
      const refreshTime = this.currentSession.expiresAt - Date.now() - 60000;
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

  // Magic Link and OTP not supported in Directus by default
  async signInWithMagicLink?(): Promise<{ error?: Error }> {
    return { error: new Error('Magic link not supported in Directus provider') };
  }

  async signInWithOTP?(): Promise<{ error?: Error }> {
    return { error: new Error('OTP not supported in Directus provider') };
  }

  async verifyOTP?(): Promise<AuthResult> {
    return { error: new ProviderError('OTP not supported in Directus provider', 'directus') };
  }
}
