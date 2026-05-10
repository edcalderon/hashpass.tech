/**
 * Supabase Adapter - wraps SupabaseProvider to implement IPrimaryProvider
 * @whitelabel/auth
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseProvider } from '../../providers/supabase/SupabaseProvider.js';
import type { User, Session, AuthResult, StorageAdapter, AuthState, OAuthProvider } from '../../types/auth.js';
import { ProviderError } from '../../types/auth.js';
import type { IPrimaryProvider } from '../../types/provider.js';
import type { SupabaseConfig } from '../../types/config.js';

export class SupabaseAdapter implements IPrimaryProvider {
  readonly name = 'supabase';
  storage: StorageAdapter;
  
  private provider: SupabaseProvider;

  constructor(config: SupabaseConfig, storage: StorageAdapter) {
    this.storage = storage;
    this.provider = new SupabaseProvider(config, storage);
  }

  // ========== Core Authentication ==========
  
  async signInWithEmailAndPassword(email: string, password: string): Promise<AuthResult> {
    return this.provider.signInWithEmailAndPassword(email, password);
  }

  async getSession(): Promise<Session | null> {
    return this.provider.getSession();
  }

  async refreshSession(): Promise<AuthResult> {
    return this.provider.refreshSession();
  }

  async signOut(): Promise<void> {
    return this.provider.signOut();
  }

  // ========== State Management ==========
  
  isAuthenticated(): boolean {
    return this.provider.isAuthenticated();
  }

  getUser(): User | null {
    return this.provider.getUser();
  }

  onAuthStateChange(callback: (state: AuthState) => void): () => void {
    return this.provider.onAuthStateChange(callback);
  }

  // ========== IPrimaryProvider Methods ==========
  
  async signUp(email: string, password: string, metadata?: Record<string, unknown>): Promise<AuthResult> {
    try {
      const client = this.provider.getSupabaseClient();
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
        },
      });

      if (error) {
        return { error: new ProviderError(error.message, 'supabase', 400) };
      }

      if (!data.session || !data.user) {
        return { error: new ProviderError('No session created', 'supabase') };
      }

      // Map the session using the provider's internal method
      const session = await this.provider.getSession();
      return { user: session?.user, session };
    } catch (error) {
      return {
        error: new ProviderError(
          error instanceof Error ? error.message : 'Sign up failed',
          'supabase'
        ),
      };
    }
  }

  async updateUser(userId: string, data: Partial<User>): Promise<User> {
    const client = this.provider.getSupabaseClient();
    
    // Update auth user metadata
    const { error } = await client.auth.updateUser({
      data: {
        first_name: data.firstName,
        last_name: data.lastName,
        avatar_url: data.avatar,
        ...data.userMetadata,
      },
    });

    if (error) {
      throw new Error(`Failed to update user: ${error.message}`);
    }

    // Update user_profiles table
    const { error: profileError } = await client
      .from('user_profiles')
      .update({
        first_name: data.firstName,
        last_name: data.lastName,
        avatar_url: data.avatar,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (profileError) {
      throw new Error(`Failed to update profile: ${profileError.message}`);
    }

    const user = this.provider.getUser();
    if (!user) {
      throw new Error('User not found');
    }

    return { ...user, ...data };
  }

  async deleteUser(userId: string): Promise<void> {
    const client = this.provider.getSupabaseClient();
    
    // Delete from user_profiles first
    await client.from('user_profiles').delete().eq('id', userId);
    
    // Note: Deleting auth user requires service role key
    // This is handled server-side in production
  }

  async linkOAuthIdentity(
    userId: string, 
    provider: OAuthProvider, 
    tokens: { accessToken: string }
  ): Promise<void> {
    const client = this.provider.getSupabaseClient();
    
    // Store OAuth identity in user_profiles
    const { error } = await client
      .from('user_profiles')
      .update({
        [`${provider}_id`]: tokens.accessToken, // Store OAuth ID
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to link OAuth identity: ${error.message}`);
    }
  }

  async unlinkOAuthIdentity(
    userId: string, 
    provider: OAuthProvider
  ): Promise<void> {
    const client = this.provider.getSupabaseClient();
    
    const { error } = await client
      .from('user_profiles')
      .update({
        [`${provider}_id`]: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to unlink OAuth identity: ${error.message}`);
    }
  }

  // ========== Optional Methods ==========
  
  async signInWithMagicLink(email: string, redirectTo?: string): Promise<{ error?: Error }> {
    return this.provider.signInWithMagicLink(email, redirectTo);
  }

  async signInWithOTP(email: string, phone?: string): Promise<{ error?: Error }> {
    return this.provider.signInWithOTP(email, phone);
  }

  async verifyOTP(code: string, type: 'email' | 'sms', email?: string): Promise<AuthResult> {
    return this.provider.verifyOTP(code, type, email);
  }

  // ========== Access to underlying client ==========
  
  getSupabaseClient(): SupabaseClient {
    return this.provider.getSupabaseClient();
  }
}
