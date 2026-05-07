/**
 * Provider interface definitions for @whitelabel/auth
 * Defines the contract that all authentication providers must implement
 * @whitelabel/auth
 */

import type { User, Session, AuthResult, AuthState, AuthStateChangeCallback, Unsubscribe, OAuthProvider, StorageAdapter } from './auth.js';

/**
 * Core authentication provider interface
 * All auth providers (Supabase, Directus, Strapi, etc.) must implement this
 */
export interface IAuthProvider {
  /** Provider identifier */
  readonly name: string;
  
  /** Storage adapter for session persistence */
  storage: StorageAdapter;

  // ========== Core Authentication Methods ==========
  
  /**
   * Sign in with email and password
   */
  signInWithEmailAndPassword(email: string, password: string): Promise<AuthResult>;
  
  /**
   * Get current session
   */
  getSession(): Promise<Session | null>;
  
  /**
   * Refresh the current session
   */
  refreshSession(): Promise<AuthResult>;
  
  /**
   * Sign out the current user
   */
  signOut(): Promise<void>;
  
  // ========== State Management ==========
  
  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean;
  
  /**
   * Get current user
   */
  getUser(): User | null;
  
  /**
   * Subscribe to auth state changes
   */
  onAuthStateChange(callback: AuthStateChangeCallback): Unsubscribe;
  
  // ========== Optional Methods ==========
  
  /**
   * Sign in with OAuth (optional - OAuth providers only)
   */
  signInWithOAuth?(provider: OAuthProvider): Promise<AuthResult>;
  
  /**
   * Handle OAuth callback (optional - OAuth providers only)
   */
  handleOAuthCallback?(params: Record<string, string>): Promise<AuthResult>;
  
  /**
   * Sign in with magic link (optional - email providers only)
   */
  signInWithMagicLink?(email: string, redirectTo?: string): Promise<{ error?: Error }>;
  
  /**
   * Sign in with OTP (optional - SMS providers only)
   */
  signInWithOTP?(email: string, phone?: string): Promise<{ error?: Error }>;
  
  /**
   * Verify OTP code (optional - OTP providers only)
   */
  verifyOTP?(code: string, type: 'email' | 'sms', email?: string): Promise<AuthResult>;
}

/**
 * OAuth adapter interface
 * Defines the contract for OAuth-capable providers (Directus, Strapi, etc.)
 */
export interface IOAuthAdapter {
  /** Adapter identifier */
  readonly name: string;
  
  /** OAuth configuration */
  config: {
    baseUrl: string;
    redirectUrl: string;
    supportedProviders: OAuthProvider[];
  };

  /**
   * Initiate OAuth flow
   * Returns redirect URL or opens popup
   */
  initiateOAuth(provider: OAuthProvider): Promise<{ redirectUrl: string } | { pending: true }>;
  
  /**
   * Handle OAuth callback
   * Exchange code for tokens
   */
  handleCallback(params: Record<string, string>): Promise<AuthResult>;
  
  /**
   * Refresh OAuth tokens
   */
  refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: number }>;
  
  /**
   * Get user info from OAuth provider
   */
  getUserInfo(accessToken: string): Promise<User>;
  
  /**
   * Validate if OAuth provider is configured
   */
  isProviderConfigured(provider: OAuthProvider): Promise<boolean>;
}

/**
 * Primary provider interface (like Supabase)
 * Handles core user management and authentication
 */
export interface IPrimaryProvider extends IAuthProvider {
  /**
   * Sign up new user
   */
  signUp(email: string, password: string, metadata?: Record<string, unknown>): Promise<AuthResult>;
  
  /**
   * Update user data
   */
  updateUser(userId: string, data: Partial<User>): Promise<User>;
  
  /**
   * Delete user
   */
  deleteUser(userId: string): Promise<void>;
  
  /**
   * Link OAuth identity to existing user
   */
  linkOAuthIdentity?(userId: string, provider: OAuthProvider, tokens: { accessToken: string }): Promise<void>;
  
  /**
   * Unlink OAuth identity
   */
  unlinkOAuthIdentity?(userId: string, provider: OAuthProvider): Promise<void>;
}

/**
 * Secondary/OAuth provider interface (like Directus, Strapi)
 * Handles social authentication
 */
export interface ISecondaryProvider extends IAuthProvider, IOAuthAdapter {
  /**
   * Map external user to internal User type
   */
  mapExternalUser(externalUser: Record<string, unknown>): User;
  
  /**
   * Create or update user in this provider
   */
  syncUser(user: User): Promise<User>;
}

/**
 * Provider factory interface
 * Creates provider instances based on configuration
 */
export interface IProviderFactory {
  /**
   * Create primary provider instance
   */
  createPrimaryProvider(config: unknown, storage: StorageAdapter): IPrimaryProvider;
  
  /**
   * Create secondary/OAuth provider instance
   */
  createSecondaryProvider?(config: unknown, storage: StorageAdapter): ISecondaryProvider;
  
  /**
   * Check if this factory supports the given config
   */
  supports(config: unknown): boolean;
}

/**
 * Provider registry interface
 * Manages multiple provider factories
 */
export interface IProviderRegistry {
  /**
   * Register a provider factory
   */
  register(factory: IProviderFactory): void;
  
  /**
   * Create provider from config
   */
  createProvider(config: unknown, storage: StorageAdapter): IAuthProvider;
  
  /**
   * Get all registered factories
   */
  getFactories(): IProviderFactory[];
}

/**
 * User mapper interface
 * Maps users between different provider formats
 */
export interface IUserMapper {
  /**
   * Map external user format to internal User
   */
  toInternal(externalUser: Record<string, unknown>): User;
  
  /**
   * Map internal User to external format
   */
  toExternal(user: User): Record<string, unknown>;
}

/**
 * Session mapper interface
 * Maps sessions between different provider formats
 */
export interface ISessionMapper {
  /**
   * Map external session to internal Session
   */
  toInternal(externalSession: Record<string, unknown>): Session;
  
  /**
   * Map internal Session to external format
   */
  toExternal(session: Session): Record<string, unknown>;
}

// Re-export types for convenience
export type { User, Session, AuthResult, AuthState, AuthStateChangeCallback, Unsubscribe, OAuthProvider, StorageAdapter };
