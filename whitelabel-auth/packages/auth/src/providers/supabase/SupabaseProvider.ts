/**
 * Supabase authentication provider
 * @whitelabel/auth
 */

import { createClient, SupabaseClient, type Session as SupabaseSession, type User as SupabaseUser } from '@supabase/supabase-js';
import { BaseAuthProvider } from '../base/BaseAuthProvider.js';
import type { User, Session, AuthResult, OAuthProvider, StorageAdapter } from '../../types/auth.js';
import type { SupabaseConfig } from '../../types/config.js';
import { ProviderError } from '../../types/auth.js';

export class SupabaseProvider extends BaseAuthProvider {
  readonly name = 'supabase' as const;
  private client: SupabaseClient;
  private currentSession: Session | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: SupabaseConfig, storage: StorageAdapter) {
    super(storage);
    this.client = createClient(config.url, config.anonKey, config.options);
    this.initializeSession();
  }

  private async initializeSession(): Promise<void> {
    try {
      const { data: { session } } = await this.client.auth.getSession();
      if (session) {
        this.currentSession = this.mapSupabaseSession(session);
        this.setupRefreshTimer();
        this.notifyStateChange({
          user: this.currentSession.user,
          session: this.currentSession,
          isAuthenticated: true,
        });
      }

      // Listen for auth state changes
      this.client.auth.onAuthStateChange((_event, session) => {
        this.currentSession = session ? this.mapSupabaseSession(session) : null;
        this.notifyStateChange({
          user: this.currentSession?.user || null,
          session: this.currentSession,
          isAuthenticated: !!this.currentSession,
        });
      });
    } catch (error) {
      console.error('Failed to initialize Supabase session:', error);
    }
  }

  async signInWithEmailAndPassword(email: string, password: string): Promise<AuthResult> {
    try {
      const { data, error } = await this.client.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: new ProviderError(error.message, 'supabase', 401) };
      }

      if (!data.session || !data.user) {
        return { error: new ProviderError('No session created', 'supabase') };
      }

      const session = this.mapSupabaseSession(data.session);
      this.currentSession = session;
      await this.storeSession(session);
      this.setupRefreshTimer();

      return { user: session.user, session };
    } catch (error) {
      return {
        error: new ProviderError(
          error instanceof Error ? error.message : 'Sign in failed',
          'supabase'
        ),
      };
    }
  }

  async signInWithMagicLink(email: string, redirectTo?: string): Promise<{ error?: Error }> {
    try {
      const { error } = await this.client.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true,
        },
      });

      return { error: error || undefined };
    } catch (error) {
      return {
        error: error instanceof Error ? error : new Error('Failed to send magic link'),
      };
    }
  }

  async signInWithOTP(email: string, phone?: string): Promise<{ error?: Error }> {
    try {
      const { error } = await this.client.auth.signInWithOtp({
        email,
        phone: phone || undefined,
        options: {
          shouldCreateUser: true,
        },
      });

      return { error: error || undefined };
    } catch (error) {
      return {
        error: error instanceof Error ? error : new Error('Failed to send OTP'),
      };
    }
  }

  async verifyOTP(code: string, type: 'email' | 'sms', email?: string): Promise<AuthResult> {
    try {
      const params: { token: string; type: 'email' | 'sms'; email?: string } = {
        token: code,
        type,
      };
      if (email && type === 'email') {
        params.email = email;
      }
      
      const { data, error } = await this.client.auth.verifyOtp(params as any);

      if (error) {
        return { error: new ProviderError(error.message, 'supabase', 401) };
      }

      if (!data.session || !data.user) {
        return { error: new ProviderError('No session after OTP verification', 'supabase') };
      }

      const session = this.mapSupabaseSession(data.session);
      this.currentSession = session;
      await this.storeSession(session);
      this.setupRefreshTimer();

      return { user: session.user, session };
    } catch (error) {
      return {
        error: new ProviderError(
          error instanceof Error ? error.message : 'OTP verification failed',
          'supabase'
        ),
      };
    }
  }

  async getSession(): Promise<Session | null> {
    if (this.currentSession) {
      return this.currentSession;
    }

    try {
      const { data: { session } } = await this.client.auth.getSession();
      if (session) {
        this.currentSession = this.mapSupabaseSession(session);
        return this.currentSession;
      }
      return null;
    } catch (error) {
      console.error('Failed to get session:', error);
      return null;
    }
  }

  async refreshSession(): Promise<AuthResult> {
    try {
      const { data, error } = await this.client.auth.refreshSession();

      if (error) {
        return { error: new ProviderError(error.message, 'supabase') };
      }

      if (!data.session) {
        return { error: new ProviderError('No session to refresh', 'supabase') };
      }

      const session = this.mapSupabaseSession(data.session);
      this.currentSession = session;
      await this.storeSession(session);
      this.setupRefreshTimer();

      return { user: session.user, session };
    } catch (error) {
      return {
        error: new ProviderError(
          error instanceof Error ? error.message : 'Session refresh failed',
          'supabase'
        ),
      };
    }
  }

  async signOut(): Promise<void> {
    try {
      await this.client.auth.signOut();
      this.currentSession = null;
      await this.clearStoredSession();
      this.clearRefreshTimer();
      this.notifyStateChange({
        user: null,
        session: null,
        isAuthenticated: false,
      });
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }

  isAuthenticated(): boolean {
    return this.currentSession !== null;
  }

  getUser(): User | null {
    return this.currentSession?.user || null;
  }

  // OAuth methods - not supported directly in Supabase provider
  // Use HybridProvider for OAuth functionality
  async signInWithOAuth(_provider: OAuthProvider): Promise<AuthResult> {
    return {
      error: new ProviderError(
        'OAuth not supported in Supabase provider directly. Use HybridProvider.',
        'supabase'
      )
    };
  }

  async handleOAuthCallback(_params: Record<string, string>): Promise<AuthResult> {
    return {
      error: new ProviderError(
        'OAuth callback not supported in Supabase provider directly. Use HybridProvider.',
        'supabase'
      )
    };
  }

  getSupabaseClient(): SupabaseClient {
    return this.client;
  }

  private mapSupabaseSession(session: SupabaseSession): Session {
    return {
      user: this.mapSupabaseUser(session.user),
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at ? session.expires_at * 1000 : undefined,
      provider: 'supabase',
      supabaseSession: {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at ? session.expires_at * 1000 : Date.now() + 3600000,
      },
    };
  }

  private mapSupabaseUser(user: SupabaseUser): User {
    return {
      id: user.id,
      email: user.email || '',
      firstName: user.user_metadata?.first_name || user.user_metadata?.full_name?.split(' ')[0] || '',
      lastName: user.user_metadata?.last_name || user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '',
      avatar: user.user_metadata?.avatar_url,
      role: user.user_metadata?.role || 'authenticated',
      status: user.email_confirmed_at ? 'active' : 'pending',
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      lastSignInAt: user.last_sign_in_at || undefined,
      userMetadata: user.user_metadata,
      appMetadata: user.app_metadata,
      supabaseUid: user.id,
    };
  }

  private setupRefreshTimer(): void {
    this.clearRefreshTimer();
    
    if (this.currentSession?.expiresAt) {
      const refreshTime = this.currentSession.expiresAt - Date.now() - 60000; // Refresh 1 minute before expiry
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
}
