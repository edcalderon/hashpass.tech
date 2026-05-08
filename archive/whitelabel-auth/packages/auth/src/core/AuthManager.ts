/**
 * AuthManager - Main orchestrator for hybrid authentication
 * @whitelabel/auth
 */

import { SupabaseProvider } from '../providers/supabase/SupabaseProvider.js';
import { DirectusProvider } from '../providers/directus/DirectusProvider.js';
import { SyncEngine } from './SyncEngine.js';
import { createStorageAdapter } from '../utils/storage.js';
import type { User, Session, AuthResult, AuthState, AuthStateChangeCallback, Unsubscribe, OAuthProvider, WalletType } from '../types/auth.js';
import type { AuthConfig } from '../types/config.js';
import { validateConfig } from '../types/config.js';
import { ProviderError, AuthError } from '../types/auth.js';
import { WalletAuthManager } from '../wallet/WalletAuthManager.js';

export class AuthManager {
  private config: AuthConfig;
  private supabase: SupabaseProvider;
  private directus?: DirectusProvider;
  private syncEngine?: SyncEngine;
  private walletManager?: WalletAuthManager;
  private currentState: AuthState = {
    user: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
    error: null,
  };
  private stateChangeCallbacks: AuthStateChangeCallback[] = [];
  private initialized = false;

  constructor(config: AuthConfig) {
    this.config = validateConfig(config);
    
    // Initialize storage
    const storage = createStorageAdapter(
      this.config.storage.type,
      this.config.storage.customProvider
    );

    // Initialize providers
    this.supabase = new SupabaseProvider(this.config.supabase, storage);
    
    if (this.config.directus) {
      this.directus = new DirectusProvider(this.config.directus, storage);
    }

    // Initialize sync engine if both providers are configured
    if (this.directus && this.config.sync.enabled) {
      this.syncEngine = new SyncEngine(
        this.supabase,
        this.directus,
        this.config.sync
      );
    }

    // Initialize wallet auth if configured
    if (this.config.wallet) {
      this.walletManager = new WalletAuthManager(
        this.supabase.getSupabaseClient(),
        this.config.wallet,
        this.config.app
      );
    }

    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Try to restore session from storage
      const supabaseSession = await this.supabase.getSession();
      
      if (supabaseSession) {
        this.updateState({
          user: supabaseSession.user,
          session: supabaseSession,
          isAuthenticated: true,
          isLoading: false,
        });
      } else if (this.directus) {
        // Try Directus session
        const directusSession = await this.directus.getSession();
        if (directusSession) {
          // Sync to Supabase
          if (this.syncEngine) {
            const syncResult = await this.syncEngine.replicateToSupabase({
              directusUser: directusSession.user,
              session: directusSession,
            });
            
            if (syncResult.success && syncResult.user) {
              // Get the Supabase session after sync
              const newSupabaseSession = await this.supabase.getSession();
              this.updateState({
                user: syncResult.user,
                session: newSupabaseSession || directusSession,
                isAuthenticated: true,
                isLoading: false,
              });
            } else {
              this.updateState({
                user: directusSession.user,
                session: directusSession,
                isAuthenticated: true,
                isLoading: false,
              });
            }
          } else {
            this.updateState({
              user: directusSession.user,
              session: directusSession,
              isAuthenticated: true,
              isLoading: false,
            });
          }
        } else {
          this.updateState({ isLoading: false });
        }
      } else {
        this.updateState({ isLoading: false });
      }

      // Subscribe to auth state changes from providers
      this.supabase.onAuthStateChange((state) => {
        this.handleProviderStateChange('supabase', state);
      });

      if (this.directus) {
        this.directus.onAuthStateChange((state) => {
          this.handleProviderStateChange('directus', state);
        });
      }

      this.initialized = true;
    } catch (error) {
      this.updateState({
        isLoading: false,
        error: error instanceof AuthError ? error : new AuthError(
          error instanceof Error ? error.message : 'Initialization failed',
          'INIT_ERROR'
        ),
      });
    }
  }

  // Core Authentication Methods

  async signInWithEmailAndPassword(email: string, password: string): Promise<AuthResult> {
    this.updateState({ isLoading: true, error: null });

    try {
      const result = await this.supabase.signInWithEmailAndPassword(email, password);

      if (result.error) {
        this.updateState({ isLoading: false, error: result.error });
        return result;
      }

      // Sync to Directus if configured
      if (this.syncEngine && result.user) {
        await this.syncEngine.replicateToDirectus(result.user);
      }

      this.updateState({
        user: result.user,
        session: result.session,
        isAuthenticated: true,
        isLoading: false,
      });

      return result;
    } catch (error) {
      const authError = new ProviderError(
        error instanceof Error ? error.message : 'Sign in failed',
        'supabase'
      );
      this.updateState({ isLoading: false, error: authError });
      return { error: authError };
    }
  }

  async signInWithOAuth(provider: OAuthProvider): Promise<AuthResult> {
    if (!this.directus) {
      return {
        error: new ProviderError(
          'OAuth not configured. Directus provider required.',
          'hybrid'
        ),
      };
    }

    this.updateState({ isLoading: true, error: null });

    try {
      const result = await this.directus.signInWithOAuth(provider);

      if (result.error) {
        this.updateState({ isLoading: false, error: result.error });
        return result;
      }

      // OAuth is pending redirect
      if (result.pending) {
        return result;
      }

      // If session was established (e.g., in native apps)
      if (result.session && result.user) {
        // Sync to Supabase
        if (this.syncEngine) {
          const syncResult = await this.syncEngine.replicateToSupabase({
            directusUser: result.user,
            session: result.session,
            oauthProvider: provider,
          });

          if (syncResult.success && syncResult.user) {
            const supabaseSession = await this.supabase.getSession();
            this.updateState({
              user: syncResult.user,
              session: supabaseSession || result.session,
              isAuthenticated: true,
              isLoading: false,
            });
          }
        } else {
          this.updateState({
            user: result.user,
            session: result.session,
            isAuthenticated: true,
            isLoading: false,
          });
        }
      }

      return result;
    } catch (error) {
      const authError = new ProviderError(
        error instanceof Error ? error.message : 'OAuth sign in failed',
        'directus'
      );
      this.updateState({ isLoading: false, error: authError });
      return { error: authError };
    }
  }

  async handleOAuthCallback(params: Record<string, string>): Promise<AuthResult> {
    if (!this.directus) {
      return {
        error: new ProviderError(
          'OAuth not configured. Directus provider required.',
          'hybrid'
        ),
      };
    }

    this.updateState({ isLoading: true, error: null });

    try {
      const result = await this.directus.handleOAuthCallback(params);

      if (result.error) {
        this.updateState({ isLoading: false, error: result.error });
        return result;
      }

      if (result.session && result.user) {
        // Sync to Supabase
        if (this.syncEngine) {
          const syncResult = await this.syncEngine.replicateToSupabase({
            directusUser: result.user,
            session: result.session,
            oauthProvider: params.provider as OAuthProvider,
          });

          if (syncResult.success && syncResult.user) {
            // Link sessions
            const supabaseSession = await this.supabase.getSession();
            if (supabaseSession && this.syncEngine) {
              await this.syncEngine.linkSessions(supabaseSession, result.session);
            }

            this.updateState({
              user: syncResult.user,
              session: supabaseSession || result.session,
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            this.updateState({
              user: result.user,
              session: result.session,
              isAuthenticated: true,
              isLoading: false,
            });
          }
        } else {
          this.updateState({
            user: result.user,
            session: result.session,
            isAuthenticated: true,
            isLoading: false,
          });
        }
      }

      return result;
    } catch (error) {
      const authError = new ProviderError(
        error instanceof Error ? error.message : 'OAuth callback failed',
        'directus'
      );
      this.updateState({ isLoading: false, error: authError });
      return { error: authError };
    }
  }

  async signInWithMagicLink(email: string, redirectTo?: string): Promise<{ error?: Error }> {
    return this.supabase.signInWithMagicLink(email, redirectTo);
  }

  async signInWithOTP(email: string, phone?: string): Promise<{ error?: Error }> {
    return this.supabase.signInWithOTP(email, phone);
  }

  async verifyOTP(code: string, type: 'email' | 'sms', email?: string): Promise<AuthResult> {
    this.updateState({ isLoading: true, error: null });

    const result = await this.supabase.verifyOTP(code, type, email);

    if (!result.error && result.session && result.user) {
      // Sync to Directus if configured
      if (this.syncEngine) {
        await this.syncEngine.replicateToDirectus(result.user);
      }

      this.updateState({
        user: result.user,
        session: result.session,
        isAuthenticated: true,
        isLoading: false,
      });
    } else if (result.error) {
      this.updateState({ isLoading: false, error: result.error });
    }

    return result;
  }

  async signInWithWallet(type: WalletType): Promise<AuthResult> {
    if (!this.walletManager) {
      return {
        error: new AuthError(
          'Wallet authentication not configured',
          'WALLET_NOT_CONFIGURED'
        ),
      };
    }

    this.updateState({ isLoading: true, error: null });

    try {
      const result = await this.walletManager.authenticate(type);

      if (result.error) {
        this.updateState({ isLoading: false, error: result.error });
        return { error: result.error };
      }

      this.updateState({
        user: result.user,
        session: result.session,
        isAuthenticated: true,
        isLoading: false,
      });

      return result;
    } catch (error) {
      const authError = new AuthError(
        error instanceof Error ? error.message : 'Wallet authentication failed',
        'WALLET_AUTH_ERROR'
      );
      this.updateState({ isLoading: false, error: authError });
      return { error: authError };
    }
  }

  async signOut(): Promise<void> {
    this.updateState({ isLoading: true });

    try {
      // Sign out from both providers
      await Promise.all([
        this.supabase.signOut(),
        this.directus?.signOut(),
      ]);

      this.updateState({
        user: null,
        session: null,
        isAuthenticated: false,
        isLoading: false,
      });
    } catch (error) {
      console.error('Sign out error:', error);
      this.updateState({ isLoading: false });
    }
  }

  // Session Management

  async getSession(): Promise<Session | null> {
    return this.currentState.session;
  }

  async refreshSession(): Promise<AuthResult> {
    this.updateState({ isLoading: true });

    try {
      // Refresh Supabase session
      const result = await this.supabase.refreshSession();

      if (result.error) {
        this.updateState({ isLoading: false, error: result.error });
        return result;
      }

      if (result.session) {
        // Also refresh Directus session if available
        if (this.directus) {
          await this.directus.refreshSession();
        }

        this.updateState({
          user: result.user,
          session: result.session,
          isAuthenticated: true,
          isLoading: false,
        });
      }

      return result;
    } catch (error) {
      const authError = new ProviderError(
        error instanceof Error ? error.message : 'Session refresh failed',
        'supabase'
      );
      this.updateState({ isLoading: false, error: authError });
      return { error: authError };
    }
  }

  // State Checks

  isAuthenticated(): boolean {
    return this.currentState.isAuthenticated;
  }

  getUser(): User | null {
    return this.currentState.user;
  }

  isLoading(): boolean {
    return this.currentState.isLoading;
  }

  getError(): AuthError | null {
    return this.currentState.error;
  }

  // Event Subscription

  onAuthStateChange(callback: AuthStateChangeCallback): Unsubscribe {
    this.stateChangeCallbacks.push(callback);

    // Immediately call with current state
    callback(this.currentState);

    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  // Provider Access (for advanced use)

  getSupabaseProvider(): SupabaseProvider {
    return this.supabase;
  }

  getDirectusProvider(): DirectusProvider | undefined {
    return this.directus;
  }

  getSyncEngine(): SyncEngine | undefined {
    return this.syncEngine;
  }

  // Private Methods

  private updateState(partial: Partial<AuthState>): void {
    this.currentState = { ...this.currentState, ...partial };
    this.notifyStateChange();
  }

  private notifyStateChange(): void {
    this.stateChangeCallbacks.forEach(callback => {
      try {
        callback(this.currentState);
      } catch (error) {
        console.error('Auth state change callback error:', error);
      }
    });
  }

  private handleProviderStateChange(
    provider: 'supabase' | 'directus',
    state: AuthState
  ): void {
    // Handle state changes from individual providers
    // This is mainly for keeping the unified state in sync
    if (state.user && !this.currentState.user) {
      this.updateState({
        user: state.user,
        session: state.session,
        isAuthenticated: state.isAuthenticated,
      });
    }
  }
}
