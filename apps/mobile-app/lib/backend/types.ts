/**
 * Backend Abstraction Layer Types
 * 
 * This module defines the interfaces for all backend operations,
 * allowing seamless switching between Supabase and Directus.
 * 
 * Migration Strategy:
 * - Phase 1: Abstract current Supabase usage behind these interfaces
 * - Phase 2: Implement Directus providers
 * - Phase 3: Switch provider via environment variable
 * 
 * IMPORTANT: This abstraction maintains backward compatibility with Supabase
 * while enabling migration to Directus on self-hosted GCP infrastructure.
 */

// ============================================================================
// Core Types
// ============================================================================

export type BackendProvider = 'supabase' | 'directus';

export interface BackendConfig {
  provider: BackendProvider;
  
  // Database connection (shared between providers when using same Postgres)
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    ssl: boolean;
  };
  
  // Provider-specific configs
  supabase?: {
    url: string;
    anonKey: string;
    serviceRoleKey?: string;
  };
  
  directus?: {
    url: string;
    staticToken?: string;
  };
  
  // Storage (both providers use S3-compatible storage)
  storage: {
    bucket: string;
    region: string;
    accessKey: string;
    secretKey: string;
    endpoint?: string; // For GCS or custom S3-compatible storage
  };
}

// ============================================================================
// User & Authentication Types
// ============================================================================

export interface User {
  id: string;
  email?: string;
  phone?: string;
  created_at: string;
  updated_at?: string;
  last_sign_in_at?: string;
  
  // App metadata
  app_metadata?: Record<string, any>;
  user_metadata?: Record<string, any>;
  
  // Profile data (denormalized for convenience)
  profile?: UserProfile;
}

export interface UserProfile {
  id: string;
  user_id: string;
  full_name?: string;
  avatar_url?: string;
  company?: string;
  title?: string;
  bio?: string;
  wallet_address?: string;
  created_at: string;
  updated_at?: string;
}

export interface Session {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  token_type: string;
  user: User;
}

export interface AuthResponse {
  user: User | null;
  session: Session | null;
  error: AuthError | null;
}

export interface AuthError {
  message: string;
  status?: number;
  code?: string;
}

export type OAuthProvider = 'google' | 'discord' | 'apple' | 'github';

export interface OAuthOptions {
  provider: OAuthProvider;
  redirectTo?: string;
  scopes?: string;
  queryParams?: Record<string, string>;
}

export interface MagicLinkOptions {
  email: string;
  redirectTo?: string;
  shouldCreateUser?: boolean;
}

export interface OTPOptions {
  email?: string;
  phone?: string;
  options?: {
    emailRedirectTo?: string;
    shouldCreateUser?: boolean;
  };
}

export interface VerifyOTPOptions {
  email?: string;
  phone?: string;
  token: string;
  type: 'email' | 'sms' | 'phone_change' | 'email_change';
}

// Wallet authentication (Ethereum/Solana)
export interface WalletAuthOptions {
  walletAddress: string;
  signature: string;
  message: string;
  chain: 'ethereum' | 'solana';
}

// ============================================================================
// Database Types
// ============================================================================

export interface QueryOptions {
  select?: string;
  filter?: Record<string, any>;
  order?: { column: string; ascending?: boolean }[];
  limit?: number;
  offset?: number;
  single?: boolean;
}

export interface QueryResult<T> {
  data: T | null;
  error: DatabaseError | null;
  count?: number;
}

export interface DatabaseError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export interface InsertOptions {
  returning?: boolean;
  onConflict?: string;
  ignoreDuplicates?: boolean;
}

export interface UpdateOptions {
  returning?: boolean;
}

export interface DeleteOptions {
  returning?: boolean;
}

// RPC function call options
export interface RPCOptions {
  params?: Record<string, any>;
  head?: boolean;
  get?: boolean;
}

// ============================================================================
// Realtime Types
// ============================================================================

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

export interface RealtimeFilter {
  event: RealtimeEvent;
  schema?: string;
  table: string;
  filter?: string;
}

export interface RealtimePayload<T = any> {
  eventType: RealtimeEvent;
  new: T;
  old: T;
  errors: any[];
  commitTimestamp: string;
}

export interface RealtimeChannel {
  subscribe: (callback?: (status: string) => void) => RealtimeChannel;
  unsubscribe: () => void;
  on: (
    event: 'postgres_changes' | 'broadcast' | 'presence',
    filter: RealtimeFilter | { event: string },
    callback: (payload: any) => void
  ) => RealtimeChannel;
  send: (payload: { type: string; event: string; payload: any }) => Promise<void>;
}

export interface BroadcastOptions {
  event: string;
  payload: any;
}

export interface PresenceState {
  [key: string]: any[];
}

// ============================================================================
// Storage Types
// ============================================================================

export interface StorageBucket {
  id: string;
  name: string;
  public: boolean;
  created_at: string;
  updated_at?: string;
}

export interface StorageFile {
  id: string;
  name: string;
  bucket_id: string;
  owner?: string;
  created_at: string;
  updated_at?: string;
  last_accessed_at?: string;
  metadata?: Record<string, any>;
}

export interface UploadOptions {
  cacheControl?: string;
  contentType?: string;
  upsert?: boolean;
}

export interface StorageError {
  message: string;
  statusCode?: number;
}

export interface UploadResult {
  path: string;
  fullPath?: string;
  error: StorageError | null;
}

export interface DownloadResult {
  data: Blob | null;
  error: StorageError | null;
}

// ============================================================================
// Multi-tenant Support
// ============================================================================

export interface TenantContext {
  tenantId: string;
  userId?: string;
  roles?: string[];
}

// ============================================================================
// Auth State Change Subscription
// ============================================================================

export type AuthChangeEvent = 
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'PASSWORD_RECOVERY'
  | 'INITIAL_SESSION';

export interface AuthStateChangeCallback {
  (event: AuthChangeEvent, session: Session | null): void;
}

export interface AuthSubscription {
  unsubscribe: () => void;
}
