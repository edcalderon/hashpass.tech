/**
 * Backend Provider Interfaces
 * 
 * These interfaces define the contract that both Supabase and Directus
 * implementations must follow. This enables seamless provider switching.
 */

import type {
  User,
  Session,
  AuthResponse,
  AuthError,
  OAuthOptions,
  MagicLinkOptions,
  OTPOptions,
  VerifyOTPOptions,
  WalletAuthOptions,
  AuthStateChangeCallback,
  AuthSubscription,
  QueryOptions,
  QueryResult,
  InsertOptions,
  UpdateOptions,
  DeleteOptions,
  RPCOptions,
  RealtimeChannel,
  RealtimeFilter,
  StorageBucket,
  StorageFile,
  UploadOptions,
  UploadResult,
  DownloadResult,
  TenantContext,
} from './types';

// ============================================================================
// Auth Provider Interface
// ============================================================================

export interface IAuthProvider {
  // Session Management
  getSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }>;
  getUser(): Promise<{ data: { user: User | null }; error: AuthError | null }>;
  refreshSession(): Promise<AuthResponse>;
  setSession(params: { access_token: string; refresh_token: string }): Promise<AuthResponse>;
  
  // Sign In Methods
  signInWithEmail(email: string, password: string): Promise<AuthResponse>;
  signInWithOAuth(options: OAuthOptions): Promise<{ data: { url: string } | null; error: AuthError | null }>;
  signInWithMagicLink(options: MagicLinkOptions): Promise<AuthResponse>;
  signInWithOTP(options: OTPOptions): Promise<AuthResponse>;
  signInWithWallet(options: WalletAuthOptions): Promise<AuthResponse>;
  
  // Sign Up
  signUp(email: string, password: string, metadata?: Record<string, any>): Promise<AuthResponse>;
  
  // OTP Verification
  verifyOTP(options: VerifyOTPOptions): Promise<AuthResponse>;
  
  // Password Recovery
  resetPasswordForEmail(email: string, redirectTo?: string): Promise<{ error: AuthError | null }>;
  updateUser(updates: { password?: string; email?: string; data?: Record<string, any> }): Promise<AuthResponse>;
  
  // Sign Out
  signOut(): Promise<{ error: AuthError | null }>;
  
  // OAuth Code Exchange
  exchangeCodeForSession(code: string): Promise<AuthResponse>;
  
  // Auth State Subscription
  onAuthStateChange(callback: AuthStateChangeCallback): { data: { subscription: AuthSubscription } };
  
  // Admin operations (requires service role)
  admin?: IAuthAdminProvider;
}

export interface IAuthAdminProvider {
  createUser(params: {
    email: string;
    password?: string;
    email_confirm?: boolean;
    user_metadata?: Record<string, any>;
  }): Promise<AuthResponse>;
  
  deleteUser(userId: string): Promise<{ error: AuthError | null }>;
  
  listUsers(params?: { page?: number; perPage?: number }): Promise<{
    data: { users: User[] };
    error: AuthError | null;
  }>;
  
  getUserById(userId: string): Promise<{ data: { user: User | null }; error: AuthError | null }>;
  
  updateUserById(userId: string, updates: Record<string, any>): Promise<AuthResponse>;
  
  generateLink(params: {
    type: 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change';
    email: string;
    password?: string;
    redirectTo?: string;
  }): Promise<{ data: { properties: { action_link: string } } | null; error: AuthError | null }>;
}

// ============================================================================
// Database Provider Interface
// ============================================================================

export interface IDatabaseProvider {
  // Query Builder
  from(table: string): IQueryBuilder;
  
  // RPC Calls
  rpc<T = any>(functionName: string, params?: Record<string, any>, options?: RPCOptions): Promise<QueryResult<T>>;
  
  // Raw SQL (use with caution, prefer RPC)
  sql?<T = any>(query: string, params?: any[]): Promise<QueryResult<T>>;
  
  // Multi-tenant context (sets app.tenant_id for RLS)
  setTenantContext?(context: TenantContext): Promise<void>;
}

export interface IQueryBuilder {
  // SELECT
  select(columns?: string): IQueryBuilder;
  
  // INSERT
  insert(data: Record<string, any> | Record<string, any>[], options?: InsertOptions): IQueryBuilder;
  
  // UPDATE
  update(data: Record<string, any>, options?: UpdateOptions): IQueryBuilder;
  
  // DELETE
  delete(options?: DeleteOptions): IQueryBuilder;
  
  // UPSERT
  upsert(data: Record<string, any> | Record<string, any>[], options?: { onConflict?: string }): IQueryBuilder;
  
  // Filters
  eq(column: string, value: any): IQueryBuilder;
  neq(column: string, value: any): IQueryBuilder;
  gt(column: string, value: any): IQueryBuilder;
  gte(column: string, value: any): IQueryBuilder;
  lt(column: string, value: any): IQueryBuilder;
  lte(column: string, value: any): IQueryBuilder;
  like(column: string, pattern: string): IQueryBuilder;
  ilike(column: string, pattern: string): IQueryBuilder;
  is(column: string, value: null | boolean): IQueryBuilder;
  in(column: string, values: any[]): IQueryBuilder;
  contains(column: string, value: any): IQueryBuilder;
  containedBy(column: string, value: any): IQueryBuilder;
  not(column: string, operator: string, value: any): IQueryBuilder;
  or(filters: string): IQueryBuilder;
  filter(column: string, operator: string, value: any): IQueryBuilder;
  match(query: Record<string, any>): IQueryBuilder;
  
  // Modifiers
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): IQueryBuilder;
  limit(count: number): IQueryBuilder;
  range(from: number, to: number): IQueryBuilder;
  single(): IQueryBuilder;
  maybeSingle(): IQueryBuilder;
  
  // Execution
  then<T = any>(resolve: (result: QueryResult<T>) => void): Promise<QueryResult<T>>;
}

// ============================================================================
// Realtime Provider Interface
// ============================================================================

export interface IRealtimeProvider {
  // Channel Management
  channel(name: string, options?: { config?: Record<string, any> }): RealtimeChannel;
  
  // Remove a channel
  removeChannel(channel: RealtimeChannel): Promise<void>;
  
  // Remove all channels
  removeAllChannels(): Promise<void>;
  
  // Get all active channels
  getChannels(): RealtimeChannel[];
  
  // Connection state
  isConnected(): boolean;
  
  // Reconnect
  connect(): void;
  disconnect(): void;
}

// ============================================================================
// Storage Provider Interface
// ============================================================================

export interface IStorageProvider {
  // Bucket operations
  createBucket(name: string, options?: { public?: boolean }): Promise<{ data: StorageBucket | null; error: any }>;
  getBucket(name: string): Promise<{ data: StorageBucket | null; error: any }>;
  listBuckets(): Promise<{ data: StorageBucket[] | null; error: any }>;
  deleteBucket(name: string): Promise<{ error: any }>;
  emptyBucket(name: string): Promise<{ error: any }>;
  
  // File operations via bucket
  from(bucket: string): IStorageBucketApi;
}

export interface IStorageBucketApi {
  // Upload
  upload(path: string, file: File | Blob | ArrayBuffer | string, options?: UploadOptions): Promise<UploadResult>;
  
  // Download
  download(path: string): Promise<DownloadResult>;
  
  // List files
  list(folder?: string, options?: { limit?: number; offset?: number; sortBy?: { column: string; order: string } }): Promise<{ data: StorageFile[] | null; error: any }>;
  
  // Move/Copy
  move(fromPath: string, toPath: string): Promise<{ error: any }>;
  copy(fromPath: string, toPath: string): Promise<{ error: any }>;
  
  // Delete
  remove(paths: string[]): Promise<{ data: { name: string }[] | null; error: any }>;
  
  // Public URLs
  getPublicUrl(path: string): { data: { publicUrl: string } };
  
  // Signed URLs
  createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: any }>;
  createSignedUrls(paths: string[], expiresIn: number): Promise<{ data: { signedUrl: string; path: string }[] | null; error: any }>;
  
  // Signed upload URL
  createSignedUploadUrl(path: string): Promise<{ data: { signedUrl: string; token: string; path: string } | null; error: any }>;
  uploadToSignedUrl(path: string, token: string, file: File | Blob | ArrayBuffer, options?: UploadOptions): Promise<UploadResult>;
}

// ============================================================================
// Combined Backend Provider Interface
// ============================================================================

export interface IBackendProvider {
  readonly providerType: 'supabase' | 'directus';
  
  auth: IAuthProvider;
  db: IDatabaseProvider;
  realtime: IRealtimeProvider;
  storage: IStorageProvider;
  
  // Initialize the provider
  initialize(): Promise<void>;
  
  // Health check
  isHealthy(): Promise<boolean>;
  
  // Get the underlying client (for advanced use cases)
  getClient(): any;
}
