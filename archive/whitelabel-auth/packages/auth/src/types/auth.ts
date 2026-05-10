/**
 * Core authentication types and interfaces
 * @whitelabel/auth
 */

export type AuthProvider = 'supabase' | 'directus' | 'hybrid';
export type OAuthProvider = 'google' | 'github' | 'facebook' | 'twitter' | 'apple';
export type WalletType = 'ethereum' | 'solana';
export type AuthMethod = 'email' | 'oauth' | 'wallet' | 'magicLink' | 'otp';

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  role?: string;
  status?: 'active' | 'inactive' | 'pending';
  createdAt?: string;
  updatedAt?: string;
  lastSignInAt?: string;
  userMetadata?: Record<string, unknown>;
  appMetadata?: Record<string, unknown>;
  
  // Provider-specific linkage
  supabaseUid?: string;
  directusId?: string;
  
  // Wallet addresses
  ethereumAddress?: string;
  solanaAddress?: string;
}

export interface Session {
  user: User;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // Unix timestamp in milliseconds
  
  // Provider-specific session data
  provider: AuthProvider;
  supabaseSession?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  };
  directusSession?: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
  };
  
  // OAuth provider used (if applicable)
  oauthProvider?: OAuthProvider;
  
  // Wallet auth data (if applicable)
  walletAuth?: {
    type: WalletType;
    address: string;
  };
}

export interface AuthResult {
  user?: User;
  session?: Session;
  error?: AuthError;
  pending?: boolean; // For OAuth redirects
}

export class AuthError extends Error {
  code: string;
  status?: number;
  provider?: AuthProvider;
  
  constructor(message: string, code: string, status?: number, provider?: AuthProvider) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
    this.provider = provider;
  }
}

export class ProviderError extends AuthError {
  constructor(message: string, provider: AuthProvider, status?: number) {
    super(message, 'PROVIDER_ERROR', status, provider);
    this.name = 'ProviderError';
  }
}

export class SyncError extends AuthError {
  sourceProvider: AuthProvider;
  targetProvider: AuthProvider;
  
  constructor(
    message: string,
    sourceProvider: AuthProvider,
    targetProvider: AuthProvider
  ) {
    super(message, 'SYNC_ERROR', undefined, 'hybrid');
    this.name = 'SyncError';
    this.sourceProvider = sourceProvider;
    this.targetProvider = targetProvider;
  }
}

export class WalletError extends AuthError {
  walletType: WalletType;
  
  constructor(message: string, walletType: WalletType, code?: string) {
    super(message, code || 'WALLET_ERROR');
    this.name = 'WalletError';
    this.walletType = walletType;
  }
}

export interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: AuthError | null;
}

export type AuthStateChangeCallback = (state: AuthState) => void;
export type Unsubscribe = () => void;

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
