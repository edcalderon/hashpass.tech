/**
 * Common types and interfaces for authentication providers
 */

export interface AuthUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  status?: string;
  last_access?: string;
  [key: string]: any; // Allow additional provider-specific fields
}

export interface AuthSession {
  user: AuthUser;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  provider?: string;
}

export interface AuthResponse {
  user?: AuthUser;
  session?: AuthSession;
  error?: string;
  pending?: boolean; // For OAuth redirects
}

export interface AuthStateChangeCallback {
  (session: AuthSession | null): void;
}

export type AuthProvider = 'supabase' | 'directus' | 'keycloak';

/**
 * Abstract interface that all auth providers must implement
 */
export interface IAuthProvider {
  // Authentication methods
  signInWithEmailAndPassword(email: string, password: string): Promise<AuthResponse>;
  signInWithOAuth?(provider: 'google' | 'github' | 'facebook' | 'twitter'): Promise<AuthResponse>;
  handleOAuthCallback?(codeOrParams: string | Record<string, string>, state?: string): Promise<AuthResponse>;
  signOut(): Promise<{ error?: string }>;
  
  // Session management
  getSession(): Promise<AuthSession | null>;
  refreshSession(): Promise<AuthResponse>;
  isAuthenticated(): boolean;
  
  // User management
  getUser(): AuthUser | null;
  
  // State management
  onAuthStateChange(callback: AuthStateChangeCallback): () => void;
  
  // Provider info
  getProviderName(): AuthProvider;
}

/**
 * Configuration for auth providers
 */
export interface AuthProviderConfig {
  provider: AuthProvider;
  supabase?: {
    url: string;
    anonKey: string;
  };
  directus?: {
    url: string;
    adminEmail?: string;
  };
  keycloak?: {
    url: string;
    realm: string;
    clientId: string;
  };
}

/**
 * API authentication utilities interface
 */
export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

export interface ApiAuthResponse {
  user: AuthUser | null;
  error: string | null;
}
