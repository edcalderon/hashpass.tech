/**
 * Supabase authentication provider implementation
 */

import { 
  IAuthProvider, 
  AuthUser, 
  AuthSession, 
  AuthResponse, 
  AuthStateChangeCallback,
  AuthProvider 
} from '../types';
import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';
import { Platform } from 'react-native';

export class SupabaseAuthProvider implements IAuthProvider {
  private supabase: SupabaseClient;
  private currentSession: AuthSession | null = null;
  private stateChangeCallbacks: AuthStateChangeCallback[] = [];

  constructor(url: string, anonKey: string) {
    this.supabase = createClient(url, anonKey);
    this.initializeSession();
  }

  getProviderName(): AuthProvider {
    return 'supabase';
  }

  private async initializeSession(): Promise<void> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (session) {
        this.currentSession = this.mapSupabaseSession(session);
        this.notifyStateChange(this.currentSession);
      }

      // Listen for auth state changes
      this.supabase.auth.onAuthStateChange((event, session) => {
        this.currentSession = session ? this.mapSupabaseSession(session) : null;
        this.notifyStateChange(this.currentSession);
      });
    } catch (error) {
      console.error('Failed to initialize Supabase session:', error);
    }
  }

  async signInWithEmailAndPassword(email: string, password: string): Promise<AuthResponse> {
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: error.message };
      }

      if (!data.session || !data.user) {
        return { error: 'No session created' };
      }

      const session = this.mapSupabaseSession(data.session);
      this.currentSession = session;

      return { user: session.user, session };
    } catch (error) {
      console.error('Sign in error:', error);
      return { error: error instanceof Error ? error.message : 'Sign in failed' };
    }
  }

  async signInWithOAuth(provider: 'google' | 'github' | 'facebook' | 'twitter'): Promise<AuthResponse> {
    try {
      const { data, error } = await this.supabase.auth.signInWithOAuth({
        provider: provider,
        options: {
          redirectTo: Platform.OS === 'web' ? 
            `${window.location.origin}/auth/callback` : 
            'exp://localhost:8081/--/auth/callback'
        }
      });

      if (error) {
        return { error: error.message };
      }

      // For OAuth, the actual session will be established after redirect
      return { pending: true };
    } catch (error) {
      console.error('OAuth sign in error:', error);
      return { error: error instanceof Error ? error.message : 'OAuth sign in failed' };
    }
  }

  async handleOAuthCallback(codeOrParams: string | Record<string, string>, state?: string): Promise<AuthResponse> {
    try {
      // Supabase automatically handles the OAuth callback through its session management
      // Just get the current session
      const { data, error } = await this.supabase.auth.getSession();

      if (error) {
        return { error: error.message };
      }

      if (!data.session) {
        return { error: 'No session found after OAuth callback' };
      }

      const session = this.mapSupabaseSession(data.session);
      this.currentSession = session;

      return { user: session.user, session };
    } catch (error) {
      console.error('OAuth callback error:', error);
      return { error: error instanceof Error ? error.message : 'OAuth callback failed' };
    }
  }

  async signOut(): Promise<{ error?: string }> {
    try {
      const { error } = await this.supabase.auth.signOut();
      this.currentSession = null;

      if (error) {
        return { error: error.message };
      }

      return {};
    } catch (error) {
      console.error('Sign out error:', error);
      return { error: error instanceof Error ? error.message : 'Sign out failed' };
    }
  }

  async getSession(): Promise<AuthSession | null> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (session) {
        this.currentSession = this.mapSupabaseSession(session);
        return this.currentSession;
      }
      return null;
    } catch (error) {
      console.error('Get session error:', error);
      return null;
    }
  }

  async refreshSession(): Promise<AuthResponse> {
    try {
      const { data, error } = await this.supabase.auth.refreshSession();
      
      if (error) {
        return { error: error.message };
      }

      if (!data.session) {
        return { error: 'No session returned from refresh' };
      }

      const session = this.mapSupabaseSession(data.session);
      this.currentSession = session;

      return { user: session.user, session };
    } catch (error) {
      console.error('Refresh session error:', error);
      return { error: error instanceof Error ? error.message : 'Session refresh failed' };
    }
  }

  isAuthenticated(): boolean {
    return this.currentSession !== null;
  }

  getUser(): AuthUser | null {
    return this.currentSession?.user || null;
  }

  onAuthStateChange(callback: AuthStateChangeCallback): () => void {
    this.stateChangeCallbacks.push(callback);
    
    // Immediately call with current state
    callback(this.currentSession);
    
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  // Private helper methods
  private mapSupabaseSession(session: Session): AuthSession {
    const user: AuthUser = this.mapSupabaseUser(session.user);
    
    return {
      user,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at ? session.expires_at * 1000 : undefined,
      provider: 'supabase'
    };
  }

  private mapSupabaseUser(user: User): AuthUser {
    return {
      id: user.id,
      email: user.email || '',
      first_name: user.user_metadata?.first_name || user.user_metadata?.full_name?.split(' ')[0] || '',
      last_name: user.user_metadata?.last_name || user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '',
      role: user.user_metadata?.role || user.role || 'user',
      status: user.user_metadata?.status || 'active',
      last_access: user.last_sign_in_at || undefined,
      // Include additional Supabase-specific fields
      app_metadata: user.app_metadata,
      user_metadata: user.user_metadata,
      aud: user.aud,
      confirmation_sent_at: user.confirmation_sent_at,
      confirmed_at: user.confirmed_at,
      created_at: user.created_at,
      updated_at: user.updated_at,
      phone: user.phone,
      phone_confirmed_at: user.phone_confirmed_at,
      email_confirmed_at: user.email_confirmed_at,
      last_sign_in_at: user.last_sign_in_at
    };
  }

  private notifyStateChange(session: AuthSession | null): void {
    this.stateChangeCallbacks.forEach(callback => {
      try {
        callback(session);
      } catch (error) {
        console.error('Auth state change callback error:', error);
      }
    });
  }

  // Supabase-specific methods (can be accessed by casting the provider)
  getSupabaseClient(): SupabaseClient {
    return this.supabase;
  }
}