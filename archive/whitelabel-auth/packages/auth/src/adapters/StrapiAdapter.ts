/**
 * Strapi Adapter - stub implementation for future OAuth provider
 * Demonstrates how to implement ISecondaryProvider for any headless CMS
 * @whitelabel/auth
 */

import type { User, Session, AuthResult, StorageAdapter, OAuthProvider, AuthState } from '../../types/auth.js';
import { ProviderError } from '../../types/auth.js';
import type { ISecondaryProvider } from '../../types/provider.js';

export interface StrapiConfig {
  url: string;
  apiToken?: string;
  oauth?: {
    providers: OAuthProvider[];
    redirectUrl: string;
  };
}

/**
 * StrapiAdapter - Stub implementation
 * 
 * To complete this implementation:
 * 1. Implement all IAuthProvider methods
 * 2. Implement all IOAuthAdapter methods  
 * 3. Add Strapi-specific GraphQL/REST API calls
 * 4. Handle JWT token management
 * 5. Add user mapping from Strapi format
 */
export class StrapiAdapter implements ISecondaryProvider {
  readonly name = 'strapi';
  storage: StorageAdapter;
  
  config: {
    baseUrl: string;
    redirectUrl: string;
    supportedProviders: OAuthProvider[];
  };

  private strapiConfig: StrapiConfig;

  constructor(config: StrapiConfig, storage: StorageAdapter) {
    this.storage = storage;
    this.strapiConfig = config;
    
    this.config = {
      baseUrl: config.url,
      redirectUrl: config.oauth?.redirectUrl || '',
      supportedProviders: config.oauth?.providers || [],
    };
  }

  // ========== Core Authentication (Not Implemented) ==========
  
  async signInWithEmailAndPassword(_email: string, _password: string): Promise<AuthResult> {
    throw new Error(
      'Strapi email/password auth not implemented. ' +
      'Use Strapi with a primary provider like Supabase for core auth, ' +
      'and Strapi only for OAuth/OIDC integration.'
    );
  }

  async getSession(): Promise<Session | null> {
    // Try to get stored session
    try {
      const stored = await this.storage.getItem('strapi_session');
      if (!stored) return null;
      return JSON.parse(stored) as Session;
    } catch {
      return null;
    }
  }

  async refreshSession(): Promise<AuthResult> {
    throw new Error('Strapi token refresh not implemented');
  }

  async signOut(): Promise<void> {
    await this.storage.removeItem('strapi_session');
    await this.storage.removeItem('strapi_token');
  }

  // ========== State Management ==========
  
  isAuthenticated(): boolean {
    // This is async in reality but interface requires sync
    // In production, check stored token validity
    return false;
  }

  getUser(): User | null {
    // This is async in reality but interface requires sync
    return null;
  }

  onAuthStateChange(_callback: (state: AuthState) => void): () => void {
    // Strapi doesn't have real-time auth state changes
    // Return no-op unsubscribe
    return () => {};
  }

  // ========== IOAuthAdapter Methods (Stub) ==========
  
  async initiateOAuth(provider: OAuthProvider): Promise<{ redirectUrl: string } | { pending: true }> {
    // Build Strapi OAuth URL
    // Strapi uses providers like: /api/auth/${provider}/callback
    const redirectUrl = `${this.config.baseUrl}/api/auth/${provider}/callback`;
    
    return { redirectUrl };
  }

  async handleCallback(params: Record<string, string>): Promise<AuthResult> {
    // Handle Strapi OAuth callback
    // Strapi returns: ?access_token=xxx&raw[0][id]=xxx
    
    const accessToken = params.access_token || params['raw[0][access_token]'];
    if (!accessToken) {
      return {
        error: new ProviderError('No access token in callback', 'strapi'),
      };
    }

    // Store token
    await this.storage.setItem('strapi_token', accessToken);

    // Get user info
    const user = await this.getUserInfo(accessToken);
    
    const session: Session = {
      user,
      accessToken,
      provider: 'directus', // Using directus as placeholder
    };

    await this.storage.setItem('strapi_session', JSON.stringify(session));

    return { user, session };
  }

  async refreshTokens(_refreshToken: string): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: number }> {
    // Strapi uses JWT with configurable expiration
    // Refresh strategy depends on your Strapi plugin setup
    throw new Error('Strapi token refresh not implemented');
  }

  async getUserInfo(accessToken: string): Promise<User> {
    // Fetch user from Strapi
    const response = await fetch(`${this.config.baseUrl}/api/users/me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get user info from Strapi');
    }

    const data = await response.json();
    return this.mapExternalUser(data);
  }

  async isProviderConfigured(provider: OAuthProvider): Promise<boolean> {
    // Check if Strapi has this OAuth provider configured
    // You'd need to query Strapi's config or just try the auth flow
    return this.config.supportedProviders.includes(provider);
  }

  // ========== ISecondaryProvider Methods ==========
  
  mapExternalUser(externalUser: Record<string, unknown>): User {
    // Map Strapi user format to internal User
    const avatarData = externalUser.avatar as { url?: string } | undefined;
    return {
      id: externalUser.id as string,
      email: externalUser.email as string,
      firstName: externalUser.firstName as string | undefined,
      lastName: externalUser.lastName as string | undefined,
      avatar: avatarData?.url,
      role: externalUser.role?.name as string | undefined,
      status: 'active',
      userMetadata: externalUser,
    };
  }

  async syncUser(user: User): Promise<User> {
    // Sync user to Strapi
    // This would create/update a Strapi user via API
    throw new Error('Strapi user sync not implemented');
  }

  // ========== OAuth Specific ==========
  
  async signInWithOAuth(provider: OAuthProvider): Promise<AuthResult> {
    return this.initiateOAuth(provider).then(result => {
      if ('redirectUrl' in result) {
        // For web, redirect
        if (typeof window !== 'undefined') {
          window.location.href = result.redirectUrl;
          return { pending: true };
        }
        return { error: new ProviderError('OAuth requires browser', 'strapi') };
      }
      return { pending: true };
    });
  }

  async handleOAuthCallback(params: Record<string, string>): Promise<AuthResult> {
    return this.handleCallback(params);
  }
}

/**
 * Example: How to register StrapiAdapter with ProviderFactory
 * 
 * ```typescript
 * import { ProviderFactory } from '@whitelabel/auth';
 * import { StrapiAdapter } from '@whitelabel/auth/adapters';
 * 
 * // Option 1: Register as custom provider
 * ProviderFactory.getInstance().register({
 *   supports: (config) => config.type === 'strapi',
 *   createPrimaryProvider: () => { throw new Error('Strapi is OAuth only'); },
 *   createSecondaryProvider: (config, storage) => new StrapiAdapter(config, storage),
 * });
 * 
 * // Option 2: Use directly
 * const strapi = new StrapiAdapter({
 *   url: 'https://my-strapi.com',
 *   oauth: {
 *     providers: ['google', 'github'],
 *     redirectUrl: 'https://myapp.com/auth/callback'
 *   }
 * }, storage);
 * ```
 */
