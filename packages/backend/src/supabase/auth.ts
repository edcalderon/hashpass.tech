/**
 * Supabase Auth Provider Implementation
 * 
 * Wraps the existing Supabase auth functionality behind the IAuthProvider interface.
 * This is the first step in the migration - maintaining full backward compatibility.
 */

import type { SupabaseClient, User as SupabaseUser, Session as SupabaseSession } from '@supabase/supabase-js';
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
} from '../types';
import type { IAuthProvider, IAuthAdminProvider } from '../interfaces';

// Helper to convert Supabase user to our User type
function toUser(supabaseUser: SupabaseUser | null): User | null {
  if (!supabaseUser) return null;
  
  return {
    id: supabaseUser.id,
    email: supabaseUser.email,
    phone: supabaseUser.phone,
    created_at: supabaseUser.created_at,
    updated_at: supabaseUser.updated_at,
    last_sign_in_at: supabaseUser.last_sign_in_at,
    app_metadata: supabaseUser.app_metadata,
    user_metadata: supabaseUser.user_metadata,
  };
}

// Helper to convert Supabase session to our Session type
function toSession(supabaseSession: SupabaseSession | null): Session | null {
  if (!supabaseSession) return null;
  
  return {
    access_token: supabaseSession.access_token,
    refresh_token: supabaseSession.refresh_token,
    expires_at: supabaseSession.expires_at,
    expires_in: supabaseSession.expires_in,
    token_type: supabaseSession.token_type,
    user: toUser(supabaseSession.user)!,
  };
}

// Helper to convert Supabase auth error
function toAuthError(error: any): AuthError | null {
  if (!error) return null;
  
  return {
    message: error.message || 'Unknown error',
    status: error.status,
    code: error.code,
  };
}

export class SupabaseAuthProvider implements IAuthProvider {
  private client: SupabaseClient;
  private serviceRoleClient?: SupabaseClient;
  
  admin?: IAuthAdminProvider;
  
  constructor(client: SupabaseClient, serviceRoleClient?: SupabaseClient) {
    this.client = client;
    this.serviceRoleClient = serviceRoleClient;
    
    if (serviceRoleClient) {
      this.admin = new SupabaseAuthAdminProvider(serviceRoleClient);
    }
  }
  
  async getSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }> {
    const { data, error } = await this.client.auth.getSession();
    return {
      data: { session: toSession(data.session) },
      error: toAuthError(error),
    };
  }
  
  async getUser(): Promise<{ data: { user: User | null }; error: AuthError | null }> {
    const { data, error } = await this.client.auth.getUser();
    return {
      data: { user: toUser(data.user) },
      error: toAuthError(error),
    };
  }
  
  async refreshSession(): Promise<AuthResponse> {
    const { data, error } = await this.client.auth.refreshSession();
    return {
      user: toUser(data.user),
      session: toSession(data.session),
      error: toAuthError(error),
    };
  }
  
  async setSession(params: { access_token: string; refresh_token: string }): Promise<AuthResponse> {
    const { data, error } = await this.client.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    return {
      user: toUser(data.user),
      session: toSession(data.session),
      error: toAuthError(error),
    };
  }
  
  async signInWithEmail(email: string, password: string): Promise<AuthResponse> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });
    return {
      user: toUser(data.user),
      session: toSession(data.session),
      error: toAuthError(error),
    };
  }
  
  async signInWithOAuth(options: OAuthOptions): Promise<{ data: { url: string } | null; error: AuthError | null }> {
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider: options.provider,
      options: {
        redirectTo: options.redirectTo,
        scopes: options.scopes,
        queryParams: options.queryParams,
      },
    });
    return {
      data: data.url ? { url: data.url } : null,
      error: toAuthError(error),
    };
  }
  
  async signInWithMagicLink(options: MagicLinkOptions): Promise<AuthResponse> {
    const { data, error } = await this.client.auth.signInWithOtp({
      email: options.email,
      options: {
        emailRedirectTo: options.redirectTo,
        shouldCreateUser: options.shouldCreateUser ?? true,
      },
    });
    return {
      user: toUser(data.user),
      session: toSession(data.session),
      error: toAuthError(error),
    };
  }
  
  async signInWithOTP(options: OTPOptions): Promise<AuthResponse> {
    const signInOptions: { email?: string; phone?: string; options?: any } = {};
    if (options.email) signInOptions.email = options.email;
    if (options.phone) signInOptions.phone = options.phone;
    if (options.options) signInOptions.options = options.options;
    
    const { data, error } = await this.client.auth.signInWithOtp(signInOptions as any);
    return {
      user: toUser(data.user),
      session: toSession(data.session),
      error: toAuthError(error),
    };
  }
  
  async signInWithWallet(options: WalletAuthOptions): Promise<AuthResponse> {
    // Wallet auth typically requires a custom backend endpoint
    // This is a placeholder - actual implementation depends on your wallet auth flow
    throw new Error('Wallet authentication should be handled via custom API endpoint');
  }
  
  async signUp(email: string, password: string, metadata?: Record<string, any>): Promise<AuthResponse> {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
      },
    });
    return {
      user: toUser(data.user),
      session: toSession(data.session),
      error: toAuthError(error),
    };
  }
  
  async verifyOTP(options: VerifyOTPOptions): Promise<AuthResponse> {
    const verifyOptions: { email?: string; phone?: string; token: string; type: string } = {
      token: options.token,
      type: options.type,
    };
    if (options.email) verifyOptions.email = options.email;
    if (options.phone) verifyOptions.phone = options.phone;
    
    const { data, error } = await this.client.auth.verifyOtp(verifyOptions as any);
    return {
      user: toUser(data.user),
      session: toSession(data.session),
      error: toAuthError(error),
    };
  }
  
  async resetPasswordForEmail(email: string, redirectTo?: string): Promise<{ error: AuthError | null }> {
    const { error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    return { error: toAuthError(error) };
  }
  
  async updateUser(updates: { password?: string; email?: string; data?: Record<string, any> }): Promise<AuthResponse> {
    const { data, error } = await this.client.auth.updateUser(updates);
    return {
      user: toUser(data.user),
      session: null,
      error: toAuthError(error),
    };
  }
  
  async signOut(): Promise<{ error: AuthError | null }> {
    const { error } = await this.client.auth.signOut();
    return { error: toAuthError(error) };
  }
  
  async exchangeCodeForSession(code: string): Promise<AuthResponse> {
    const { data, error } = await this.client.auth.exchangeCodeForSession(code);
    return {
      user: toUser(data.user),
      session: toSession(data.session),
      error: toAuthError(error),
    };
  }
  
  onAuthStateChange(callback: AuthStateChangeCallback): { data: { subscription: AuthSubscription } } {
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      callback(event as any, toSession(session));
    });
    
    return {
      data: {
        subscription: {
          unsubscribe: () => data.subscription.unsubscribe(),
        },
      },
    };
  }
}

// Admin provider implementation
class SupabaseAuthAdminProvider implements IAuthAdminProvider {
  private client: SupabaseClient;
  
  constructor(client: SupabaseClient) {
    this.client = client;
  }
  
  async createUser(params: {
    email: string;
    password?: string;
    email_confirm?: boolean;
    user_metadata?: Record<string, any>;
  }): Promise<AuthResponse> {
    const { data, error } = await this.client.auth.admin.createUser({
      email: params.email,
      password: params.password,
      email_confirm: params.email_confirm,
      user_metadata: params.user_metadata,
    });
    return {
      user: toUser(data.user),
      session: null,
      error: toAuthError(error),
    };
  }
  
  async deleteUser(userId: string): Promise<{ error: AuthError | null }> {
    const { error } = await this.client.auth.admin.deleteUser(userId);
    return { error: toAuthError(error) };
  }
  
  async listUsers(params?: { page?: number; perPage?: number }): Promise<{
    data: { users: User[] };
    error: AuthError | null;
  }> {
    const { data, error } = await this.client.auth.admin.listUsers({
      page: params?.page,
      perPage: params?.perPage,
    });
    return {
      data: { users: (data.users || []).map(u => toUser(u)!) },
      error: toAuthError(error),
    };
  }
  
  async getUserById(userId: string): Promise<{ data: { user: User | null }; error: AuthError | null }> {
    const { data, error } = await this.client.auth.admin.getUserById(userId);
    return {
      data: { user: toUser(data.user) },
      error: toAuthError(error),
    };
  }
  
  async updateUserById(userId: string, updates: Record<string, any>): Promise<AuthResponse> {
    const { data, error } = await this.client.auth.admin.updateUserById(userId, updates);
    return {
      user: toUser(data.user),
      session: null,
      error: toAuthError(error),
    };
  }
  
  async generateLink(params: {
    type: 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change';
    email: string;
    password?: string;
    redirectTo?: string;
  }): Promise<{ data: { properties: { action_link: string } } | null; error: AuthError | null }> {
    // Map email_change to email_change_new for Supabase API
    const mappedType = params.type === 'email_change' ? 'email_change_new' : params.type;
    
    const { data, error } = await this.client.auth.admin.generateLink({
      type: mappedType as any,
      email: params.email,
      password: params.password,
      options: {
        redirectTo: params.redirectTo,
      },
    });
    return {
      data: data.properties ? { properties: { action_link: data.properties.action_link } } : null,
      error: toAuthError(error),
    };
  }
}
