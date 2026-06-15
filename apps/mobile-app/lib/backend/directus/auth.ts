/**
 * Directus Auth Provider Implementation
 * 
 * Implements authentication using Directus API.
 * Directus uses JWT tokens and provides its own auth system.
 * 
 * Key differences from Supabase:
 * - Uses /auth/login and /auth/refresh endpoints
 * - OAuth is handled differently (must be configured in Directus admin)
 * - No built-in magic link (can be implemented via custom flow)
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
} from '../types';
import type { IAuthProvider, IAuthAdminProvider } from '../interfaces';

interface DirectusAuthConfig {
  baseUrl: string;
  staticToken?: string;
}

interface DirectusUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  status: string;
  role: string;
  token?: string;
  password?: string;
  external_identifier?: string;
  provider?: string;
}

interface DirectusSession {
  access_token: string;
  refresh_token: string;
  expires: number;
}

// Helper to convert Directus user to our User type
function toUser(directusUser: DirectusUser | null): User | null {
  if (!directusUser) return null;
  
  return {
    id: directusUser.id,
    email: directusUser.email,
    created_at: new Date().toISOString(), // Directus doesn't expose this directly
    user_metadata: {
      first_name: directusUser.first_name,
      last_name: directusUser.last_name,
      full_name: [directusUser.first_name, directusUser.last_name].filter(Boolean).join(' '),
    },
    app_metadata: {
      role: directusUser.role,
      provider: directusUser.provider || 'local',
    },
  };
}

// Helper to create auth error
function createAuthError(message: string, status?: number, code?: string): AuthError {
  return { message, status, code };
}

// Storage for session (will use same storage adapter as Supabase)
let sessionStorage: Storage | null = null;
const SESSION_KEY = 'directus_session';

export class DirectusAuthProvider implements IAuthProvider {
  private config: DirectusAuthConfig;
  private currentSession: DirectusSession | null = null;
  private authCallbacks: Set<AuthStateChangeCallback> = new Set();
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  
  admin?: IAuthAdminProvider;
  
  constructor(config: DirectusAuthConfig) {
    this.config = config;
    
    // Initialize storage based on platform
    if (typeof window !== 'undefined' && window.localStorage) {
      sessionStorage = window.localStorage;
    }
    
    // Load session from storage
    this.loadSession();
    
    // Set up admin provider if static token provided
    if (config.staticToken) {
      this.admin = new DirectusAuthAdminProvider(config);
    }
  }
  
  private async loadSession() {
    if (sessionStorage) {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (stored) {
        try {
          this.currentSession = JSON.parse(stored);
          this.scheduleRefresh();
        } catch {
          // Invalid session data
          sessionStorage.removeItem(SESSION_KEY);
        }
      }
    }
  }
  
  private saveSession(session: DirectusSession | null) {
    this.currentSession = session;
    
    if (sessionStorage) {
      if (session) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } else {
        sessionStorage.removeItem(SESSION_KEY);
      }
    }
    
    this.scheduleRefresh();
  }
  
  private scheduleRefresh() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    
    if (this.currentSession) {
      // Refresh 5 minutes before expiry
      const expiresIn = (this.currentSession.expires - Date.now() / 1000) - 300;
      if (expiresIn > 0) {
        this.refreshTimer = setTimeout(() => {
          this.refreshSession();
        }, expiresIn * 1000);
      }
    }
  }
  
  private async fetchDirectus<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ data: T | null; error: AuthError | null }> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      };
      
      // Add auth token if available
      if (this.currentSession?.access_token) {
        headers['Authorization'] = `Bearer ${this.currentSession.access_token}`;
      } else if (this.config.staticToken) {
        headers['Authorization'] = `Bearer ${this.config.staticToken}`;
      }
      
      const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
        ...options,
        headers,
      });
      
      const json = await response.json();
      
      if (!response.ok) {
        return {
          data: null,
          error: createAuthError(
            json.errors?.[0]?.message || 'Request failed',
            response.status,
            json.errors?.[0]?.extensions?.code
          ),
        };
      }
      
      return { data: json.data as T, error: null };
    } catch (error: any) {
      return {
        data: null,
        error: createAuthError(error.message || 'Network error'),
      };
    }
  }
  
  private notifyAuthChange(event: any, session: Session | null) {
    for (const callback of this.authCallbacks) {
      callback(event, session);
    }
  }
  
  async getSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }> {
    if (!this.currentSession) {
      return { data: { session: null }, error: null };
    }
    
    // Check if expired
    if (this.currentSession.expires < Date.now() / 1000) {
      const refreshResult = await this.refreshSession();
      if (refreshResult.error) {
        return { data: { session: null }, error: refreshResult.error };
      }
    }
    
    // Fetch current user
    const userResult = await this.getUser();
    if (userResult.error || !userResult.data.user) {
      return { data: { session: null }, error: userResult.error };
    }
    
    const session: Session = {
      access_token: this.currentSession.access_token,
      refresh_token: this.currentSession.refresh_token,
      expires_at: this.currentSession.expires,
      token_type: 'Bearer',
      user: userResult.data.user,
    };
    
    return { data: { session }, error: null };
  }
  
  async getUser(): Promise<{ data: { user: User | null }; error: AuthError | null }> {
    if (!this.currentSession?.access_token) {
      return { data: { user: null }, error: null };
    }
    
    const result = await this.fetchDirectus<DirectusUser>('/users/me');
    
    return {
      data: { user: toUser(result.data) },
      error: result.error,
    };
  }
  
  async refreshSession(): Promise<AuthResponse> {
    if (!this.currentSession?.refresh_token) {
      return {
        user: null,
        session: null,
        error: createAuthError('No refresh token available'),
      };
    }
    
    const result = await this.fetchDirectus<DirectusSession>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({
        refresh_token: this.currentSession.refresh_token,
        mode: 'json',
      }),
    });
    
    if (result.error || !result.data) {
      this.saveSession(null);
      this.notifyAuthChange('SIGNED_OUT', null);
      return {
        user: null,
        session: null,
        error: result.error || createAuthError('Refresh failed'),
      };
    }
    
    this.saveSession(result.data);
    
    const userResult = await this.getUser();
    
    const session: Session = {
      access_token: result.data.access_token,
      refresh_token: result.data.refresh_token,
      expires_at: result.data.expires,
      token_type: 'Bearer',
      user: userResult.data.user!,
    };
    
    this.notifyAuthChange('TOKEN_REFRESHED', session);
    
    return {
      user: userResult.data.user,
      session,
      error: null,
    };
  }
  
  async setSession(params: { access_token: string; refresh_token: string }): Promise<AuthResponse> {
    // For Directus, we need to decode the token to get expiry
    // Simple approach: set a reasonable expiry and let refresh handle it
    const session: DirectusSession = {
      access_token: params.access_token,
      refresh_token: params.refresh_token,
      expires: Date.now() / 1000 + 3600, // Assume 1 hour
    };
    
    this.saveSession(session);
    
    const userResult = await this.getUser();
    
    const fullSession: Session = {
      access_token: params.access_token,
      refresh_token: params.refresh_token,
      expires_at: session.expires,
      token_type: 'Bearer',
      user: userResult.data.user!,
    };
    
    this.notifyAuthChange('SIGNED_IN', fullSession);
    
    return {
      user: userResult.data.user,
      session: fullSession,
      error: userResult.error,
    };
  }
  
  async signInWithEmail(email: string, password: string): Promise<AuthResponse> {
    const result = await this.fetchDirectus<DirectusSession>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, mode: 'json' }),
    });
    
    if (result.error || !result.data) {
      return {
        user: null,
        session: null,
        error: result.error || createAuthError('Login failed'),
      };
    }
    
    this.saveSession(result.data);
    
    const userResult = await this.getUser();
    
    const session: Session = {
      access_token: result.data.access_token,
      refresh_token: result.data.refresh_token,
      expires_at: result.data.expires,
      token_type: 'Bearer',
      user: userResult.data.user!,
    };
    
    this.notifyAuthChange('SIGNED_IN', session);
    
    return {
      user: userResult.data.user,
      session,
      error: null,
    };
  }
  
  async signInWithOAuth(options: OAuthOptions): Promise<{ data: { url: string } | null; error: AuthError | null }> {
    // Directus OAuth flow: redirect to Directus SSO endpoint
    const redirectTo = encodeURIComponent(options.redirectTo || window.location.origin + '/auth/callback');
    const url = `${this.config.baseUrl}/auth/login/${options.provider}?redirect=${redirectTo}`;
    
    return { data: { url }, error: null };
  }
  
  async signInWithMagicLink(options: MagicLinkOptions): Promise<AuthResponse> {
    // Directus doesn't have built-in magic links
    // This would need to be implemented via a custom extension or flow
    return {
      user: null,
      session: null,
      error: createAuthError('Magic link not supported in Directus - use OTP flow instead'),
    };
  }
  
  async signInWithOTP(options: OTPOptions): Promise<AuthResponse> {
    // OTP would need to be implemented via custom endpoint
    // This is a placeholder that should call your custom API
    return {
      user: null,
      session: null,
      error: createAuthError('OTP flow requires custom implementation'),
    };
  }
  
  async signInWithWallet(options: WalletAuthOptions): Promise<AuthResponse> {
    // Wallet auth requires custom implementation
    return {
      user: null,
      session: null,
      error: createAuthError('Wallet authentication requires custom API endpoint'),
    };
  }
  
  async signUp(email: string, password: string, metadata?: Record<string, any>): Promise<AuthResponse> {
    // Directus doesn't have a public signup by default
    // This needs to be enabled via role permissions or custom endpoint
    const result = await this.fetchDirectus<DirectusUser>('/users', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        first_name: metadata?.first_name,
        last_name: metadata?.last_name,
        status: 'active',
      }),
    });
    
    if (result.error || !result.data) {
      return {
        user: null,
        session: null,
        error: result.error || createAuthError('Signup failed'),
      };
    }
    
    // Auto-login after signup
    return this.signInWithEmail(email, password);
  }
  
  async verifyOTP(options: VerifyOTPOptions): Promise<AuthResponse> {
    // OTP verification requires custom implementation
    return {
      user: null,
      session: null,
      error: createAuthError('OTP verification requires custom API endpoint'),
    };
  }
  
  async resetPasswordForEmail(email: string, redirectTo?: string): Promise<{ error: AuthError | null }> {
    const result = await this.fetchDirectus('/auth/password/request', {
      method: 'POST',
      body: JSON.stringify({
        email,
        reset_url: redirectTo,
      }),
    });
    
    return { error: result.error };
  }
  
  async updateUser(updates: { password?: string; email?: string; data?: Record<string, any> }): Promise<AuthResponse> {
    const updateData: Record<string, any> = {};
    
    if (updates.password) updateData.password = updates.password;
    if (updates.email) updateData.email = updates.email;
    if (updates.data) {
      if (updates.data.first_name) updateData.first_name = updates.data.first_name;
      if (updates.data.last_name) updateData.last_name = updates.data.last_name;
    }
    
    const result = await this.fetchDirectus<DirectusUser>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(updateData),
    });
    
    if (result.error) {
      return { user: null, session: null, error: result.error };
    }
    
    this.notifyAuthChange('USER_UPDATED', null);
    
    return {
      user: toUser(result.data),
      session: null,
      error: null,
    };
  }
  
  async signOut(): Promise<{ error: AuthError | null }> {
    if (this.currentSession?.refresh_token) {
      await this.fetchDirectus('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: this.currentSession.refresh_token }),
      });
    }
    
    this.saveSession(null);
    this.notifyAuthChange('SIGNED_OUT', null);
    
    return { error: null };
  }
  
  async exchangeCodeForSession(code: string): Promise<AuthResponse> {
    // For Directus OAuth, the code exchange happens server-side
    // The callback receives the tokens directly
    // This is a placeholder for custom implementations
    return {
      user: null,
      session: null,
      error: createAuthError('Code exchange handled by Directus OAuth flow'),
    };
  }
  
  onAuthStateChange(callback: AuthStateChangeCallback): { data: { subscription: AuthSubscription } } {
    this.authCallbacks.add(callback);
    
    // Send initial session event
    this.getSession().then(({ data }) => {
      if (data.session) {
        callback('INITIAL_SESSION', data.session);
      }
    });
    
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            this.authCallbacks.delete(callback);
          },
        },
      },
    };
  }
}

// Admin provider for Directus
class DirectusAuthAdminProvider implements IAuthAdminProvider {
  private config: DirectusAuthConfig;
  
  constructor(config: DirectusAuthConfig) {
    this.config = config;
  }
  
  private async fetchAdmin<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ data: T | null; error: AuthError | null }> {
    try {
      const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.staticToken}`,
          ...(options.headers as Record<string, string>),
        },
      });
      
      const json = await response.json();
      
      if (!response.ok) {
        return {
          data: null,
          error: createAuthError(json.errors?.[0]?.message || 'Request failed', response.status),
        };
      }
      
      return { data: json.data as T, error: null };
    } catch (error: any) {
      return {
        data: null,
        error: createAuthError(error.message || 'Network error'),
      };
    }
  }
  
  async createUser(params: {
    email: string;
    password?: string;
    email_confirm?: boolean;
    user_metadata?: Record<string, any>;
  }): Promise<AuthResponse> {
    const result = await this.fetchAdmin<DirectusUser>('/users', {
      method: 'POST',
      body: JSON.stringify({
        email: params.email,
        password: params.password,
        first_name: params.user_metadata?.first_name,
        last_name: params.user_metadata?.last_name,
        status: 'active',
      }),
    });
    
    return {
      user: toUser(result.data),
      session: null,
      error: result.error,
    };
  }
  
  async deleteUser(userId: string): Promise<{ error: AuthError | null }> {
    const result = await this.fetchAdmin(`/users/${userId}`, { method: 'DELETE' });
    return { error: result.error };
  }
  
  async listUsers(params?: { page?: number; perPage?: number }): Promise<{
    data: { users: User[] };
    error: AuthError | null;
  }> {
    const limit = params?.perPage || 100;
    const offset = ((params?.page || 1) - 1) * limit;
    
    const result = await this.fetchAdmin<DirectusUser[]>(`/users?limit=${limit}&offset=${offset}`);
    
    return {
      data: { users: (result.data || []).map(u => toUser(u)!) },
      error: result.error,
    };
  }
  
  async getUserById(userId: string): Promise<{ data: { user: User | null }; error: AuthError | null }> {
    const result = await this.fetchAdmin<DirectusUser>(`/users/${userId}`);
    return {
      data: { user: toUser(result.data) },
      error: result.error,
    };
  }
  
  async updateUserById(userId: string, updates: Record<string, any>): Promise<AuthResponse> {
    const result = await this.fetchAdmin<DirectusUser>(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    
    return {
      user: toUser(result.data),
      session: null,
      error: result.error,
    };
  }
  
  async generateLink(params: {
    type: 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change';
    email: string;
    password?: string;
    redirectTo?: string;
  }): Promise<{ data: { properties: { action_link: string } } | null; error: AuthError | null }> {
    // Directus doesn't have built-in link generation like Supabase
    // This would need to be implemented via custom flow or extension
    return {
      data: null,
      error: createAuthError('Link generation requires custom implementation in Directus'),
    };
  }
}
