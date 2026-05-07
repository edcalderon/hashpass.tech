/**
 * Directus Adapter - wraps DirectusProvider to implement ISecondaryProvider
 * @whitelabel/auth
 */

import { DirectusProvider } from '../../providers/directus/DirectusProvider.js';
import type { User, Session, AuthResult, StorageAdapter, OAuthProvider } from '../../types/auth.js';
import type { ISecondaryProvider } from '../../types/provider.js';
import type { DirectusConfig } from '../../types/config.js';

import type { AuthState } from '../../types/auth.js';

export class DirectusAdapter implements ISecondaryProvider {
  readonly name = 'directus';
  storage: StorageAdapter;
  
  config: {
    baseUrl: string;
    redirectUrl: string;
    supportedProviders: OAuthProvider[];
  };

  private provider: DirectusProvider;

  constructor(config: DirectusConfig, storage: StorageAdapter) {
    this.storage = storage;
    this.provider = new DirectusProvider(config, storage);
    
    this.config = {
      baseUrl: config.url,
      redirectUrl: config.oauth.redirectUrl,
      supportedProviders: config.oauth.providers,
    };
  }

  // ========== Core Authentication ==========
  
  async signInWithEmailAndPassword(email: string, password: string): Promise<AuthResult> {
    return this.provider.signInWithEmailAndPassword(email, password);
  }

  async getSession(): Promise<Session | null> {
    return this.provider.getSession();
  }

  async refreshSession(): Promise<AuthResult> {
    return this.provider.refreshSession();
  }

  async signOut(): Promise<void> {
    return this.provider.signOut();
  }

  // ========== State Management ==========
  
  isAuthenticated(): boolean {
    return this.provider.isAuthenticated();
  }

  getUser(): User | null {
    return this.provider.getUser();
  }

  onAuthStateChange(callback: (state: AuthState) => void): () => void {
    return this.provider.onAuthStateChange(callback);
  }

  // ========== IOAuthAdapter Methods ==========
  
  async initiateOAuth(provider: OAuthProvider): Promise<{ redirectUrl: string } | { pending: true }> {
    const result = await this.provider.signInWithOAuth(provider);
    
    if (result.pending) {
      return { pending: true };
    }
    
    if (result.error) {
      throw result.error;
    }
    
    // Build OAuth URL for manual redirect
    const returnTo = this.config.redirectUrl;
    const oauthUrl = `${this.config.baseUrl}/auth/login/${provider}?redirect=${encodeURIComponent(returnTo)}`;
    
    return { redirectUrl: oauthUrl };
  }

  async handleCallback(params: Record<string, string>): Promise<AuthResult> {
    return this.provider.handleOAuthCallback(params);
  }

  async refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: number }> {
    const result = await this.provider.refreshSession();
    
    if (result.error || !result.session) {
      throw result.error || new Error('Failed to refresh tokens');
    }
    
    return {
      accessToken: result.session.accessToken,
      refreshToken: result.session.refreshToken,
      expiresAt: result.session.expiresAt,
    };
  }

  async getUserInfo(accessToken: string): Promise<User> {
    // Directus-specific user info fetch
    const response = await fetch(`${this.config.baseUrl}/users/me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get user info');
    }

    const data = await response.json();
    return this.mapExternalUser(data.data);
  }

  async isProviderConfigured(provider: OAuthProvider): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/auth/providers`);
      const data = await response.json();
      
      if (data.errors) {
        return false;
      }
      
      const availableProviders = data.data || [];
      return availableProviders.some((p: { name: string }) => p.name === provider);
    } catch {
      return false;
    }
  }

  // ========== ISecondaryProvider Methods ==========
  
  mapExternalUser(externalUser: Record<string, unknown>): User {
    return {
      id: externalUser.id as string,
      email: externalUser.email as string,
      firstName: externalUser.first_name as string | undefined,
      lastName: externalUser.last_name as string | undefined,
      avatar: externalUser.avatar as string | undefined,
      role: externalUser.role as string | undefined,
      status: (externalUser.status as 'active' | 'inactive' | 'pending') || 'active',
      userMetadata: {
        provider: externalUser.provider,
        externalIdentifier: externalUser.external_identifier,
        ...externalUser,
      },
      directusId: externalUser.id as string,
    };
  }

  async syncUser(user: User): Promise<User> {
    // Check if user exists in Directus
    const existingUser = await this.provider.getUserById(user.directusId || user.id);
    
    if (existingUser) {
      // Update existing user
      return this.provider.createOrUpdateUser({
        id: user.directusId || user.id,
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
        avatar: user.avatar,
        role: user.role,
        status: user.status,
      }) as Promise<User>;
    } else {
      // Create new user
      return this.provider.createOrUpdateUser({
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
        avatar: user.avatar,
        role: user.role || 'authenticated',
        status: user.status || 'active',
        provider: 'sync',
      }) as Promise<User>;
    }
  }

  // ========== OAuth Specific ==========
  
  async signInWithOAuth(provider: OAuthProvider): Promise<AuthResult> {
    return this.provider.signInWithOAuth(provider);
  }

  async handleOAuthCallback(params: Record<string, string>): Promise<AuthResult> {
    return this.provider.handleOAuthCallback(params);
  }

  // ========== Helper Methods ==========
  
  getProvider(): DirectusProvider {
    return this.provider;
  }
}
