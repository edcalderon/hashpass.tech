/**
 * AuthOrchestrator - Provider-agnostic authentication orchestrator
 * Uses dependency injection pattern for maximum flexibility
 * @whitelabel/auth
 */

import type {
  User,
  Session,
  AuthResult,
  AuthState,
  AuthStateChangeCallback,
  Unsubscribe,
  OAuthProvider,
  WalletType,
  StorageAdapter,
} from '../types/auth.js';
import type { IPrimaryProvider, ISecondaryProvider } from '../types/provider.js';
import type { AuthConfig, SyncConfig } from '../types/config.js';
import { AuthError, ProviderError } from '../types/auth.js';
import { createStorageAdapter } from '../utils/storage.js';
import { WalletAuthManager } from '../wallet/WalletAuthManager.js';
import { ProviderFactory } from './ProviderFactory.js';
import { SyncEngine } from './SyncEngine.js';

export interface OrchestratorConfig {
  /** Primary provider (required) - handles core user management */
  primary: IPrimaryProvider;
  
  /** Secondary/OAuth provider (optional) - handles social auth */
  secondary?: ISecondaryProvider;
  
  /** Storage adapter for session persistence */
  storage: StorageAdapter;
  
  /** Sync configuration between providers */
  sync?: SyncConfig;
  
  /** Wallet authentication configuration */
  wallet?: {
    enabled: boolean;
    ethereum?: { chainId: number; rpcUrl?: string };
    solana?: { network: string; rpcUrl?: string };
  };
  
  /** Application info for SIWE/SIWS messages */
  app?: { name: string; url: string };
}

/**
 * AuthOrchestrator - The main entry point for provider-agnostic authentication
 * 
 * Unlike AuthManager which instantiates providers internally, AuthOrchestrator
 * uses dependency injection, allowing you to:
 * 1. Swap providers without changing orchestrator code
 * 2. Inject mock providers for testing
 * 3. Use custom provider implementations
 * 4. Support multiple OAuth backends (Directus, Strapi, etc.)
 */
export class AuthOrchestrator {
  private config: OrchestratorConfig;
  private primary: IPrimaryProvider;
  private secondary?: ISecondaryProvider;
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

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.primary = config.primary;
    this.secondary = config.secondary;
    
    // Initialize sync engine if both providers are present
    if (this.secondary && config.sync?.enabled) {
      this.syncEngine = new SyncEngine(
        this.primary,
        this.secondary,
        config.sync
      );
    }
    
    // Initialize wallet manager if configured
    if (config.wallet?.enabled) {
      // Get Supabase client from primary provider if available
      const supabaseClient = (this.primary as any).getSupabaseClient?.();
      if (supabaseClient) {
        this.walletManager = new WalletAuthManager(
          supabaseClient,
          {
            ethereum: config.wallet.ethereum,
            solana: config.wallet.solana,
          },
          config.app
        );
      }
    }
    
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Try to restore primary session first
      const primarySession = await this.primary.getSession();
      
      if (primarySession) {
        this.updateState({
          user: primarySession.user,
          session: primarySession,
          isAuthenticated: true,
          isLoading: false,
        });
      } else if (this.secondary) {
        // Try secondary session
        const secondarySession = await this.secondary.getSession();
        
        if (secondarySession) {
          // Sync to primary
          if (this.syncEngine) {
            await this.syncEngine.replicateToPrimary({
              externalUser: secondarySession.user,
              session: secondarySession,
            });
            
            const primarySessionAfterSync = await this.primary.getSession();
            this.updateState({
              user: secondarySession.user,
              session: primarySessionAfterSync || secondarySession,
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            this.updateState({
              user: secondarySession.user,
              session: secondarySession,
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

      // Subscribe to auth state changes from primary provider
      this.primary.onAuthStateChange((state) => {
        this.handleProviderStateChange('primary', state);
      });

      if (this.secondary) {
        this.secondary.onAuthStateChange((state) => {
          this.handleProviderStateChange('secondary', state);
        });
      }
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

  // ========== Authentication Methods ==========

  async signInWithEmailAndPassword(email: string, password: string): Promise<AuthResult> {
    this.updateState({ isLoading: true, error: null });

    const result = await this.primary.signInWithEmailAndPassword(email, password);

    if (result.error) {
      this.updateState({ isLoading: false, error: result.error });
      return result;
    }

    // Sync to secondary if configured
    if (this.syncEngine && result.user) {
      await this.syncEngine.replicateToSecondary(result.user);
    }

    this.updateState({
      user: result.user,
      session: result.session,
      isAuthenticated: true,
      isLoading: false,
    });

    return result;
  }

  async signUp(email: string, password: string, metadata?: Record<string, unknown>): Promise<AuthResult> {
    this.updateState({ isLoading: true, error: null });

    const result = await this.primary.signUp(email, password, metadata);

    if (result.error) {
      this.updateState({ isLoading: false, error: result.error });
      return result;
    }

    // Sync to secondary if configured
    if (this.syncEngine && result.user) {
      await this.syncEngine.replicateToSecondary(result.user);
    }

    this.updateState({
      user: result.user,
      session: result.session,
      isAuthenticated: true,
      isLoading: false,
    });

    return result;
  }

  // ========== Magic Link & OTP Methods ==========

  async signInWithMagicLink(email: string, redirectTo?: string): Promise<{ error?: Error }> {
    if (this.primary.signInWithMagicLink) {
      return this.primary.signInWithMagicLink(email, redirectTo);
    }
    return { error: new Error('Magic link not supported') };
  }

  async signInWithOTP(email: string, phone?: string): Promise<{ error?: Error }> {
    if (this.primary.signInWithOTP) {
      return this.primary.signInWithOTP(email, phone);
    }
    return { error: new Error('OTP not supported') };
  }

  async verifyOTP(code: string, type: 'email' | 'sms', email?: string): Promise<AuthResult> {
    this.updateState({ isLoading: true, error: null });

    if (this.primary.verifyOTP) {
      const result = await this.primary.verifyOTP(code, type, email);

      if (result.error) {
        this.updateState({ isLoading: false, error: result.error });
        return result;
      }

      if (result.session && result.user) {
        if (this.syncEngine && result.user) {
          await this.syncEngine.replicateToSecondary(result.user);
        }

        this.updateState({
          user: result.user,
          session: result.session,
          isAuthenticated: true,
          isLoading: false,
        });
      }

      return result;
    }

    return {
      error: new ProviderError('OTP verification not supported', 'supabase'),
    };
  }

  async signInWithOAuth(provider: OAuthProvider): Promise<AuthResult> {
    if (!this.secondary) {
      return {
        error: new ProviderError(
          'OAuth not configured. Secondary provider required.',
          'hybrid'
        ),
      };
    }

    this.updateState({ isLoading: true, error: null });

    const result = await this.secondary.signInWithOAuth(provider);

    if (result.error) {
      this.updateState({ isLoading: false, error: result.error });
      return result;
    }

    if (result.pending) {
      return result;
    }

    if (result.session && result.user) {
      // Sync to primary
      if (this.syncEngine) {
        await this.syncEngine.replicateToPrimary({
          externalUser: result.user,
          session: result.session,
          oauthProvider: provider,
        });

        const primarySession = await this.primary.getSession();
        this.updateState({
          user: result.user,
          session: primarySession || result.session,
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
    }

    return result;
  }

  async handleOAuthCallback(params: Record<string, string>): Promise<AuthResult> {
    if (!this.secondary) {
      return {
        error: new ProviderError(
          'OAuth not configured. Secondary provider required.',
          'hybrid'
        ),
      };
    }

    this.updateState({ isLoading: true, error: null });

    const result = await this.secondary.handleOAuthCallback(params);

    if (result.error) {
      this.updateState({ isLoading: false, error: result.error });
      return result;
    }

    if (result.session && result.user) {
      // Sync to primary
      if (this.syncEngine) {
        await this.syncEngine.replicateToPrimary({
          externalUser: result.user,
          session: result.session,
          oauthProvider: params.provider as OAuthProvider,
        });

        const primarySession = await this.primary.getSession();
        this.updateState({
          user: result.user,
          session: primarySession || result.session,
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
  }

  async signOut(): Promise<void> {
    this.updateState({ isLoading: true });

    try {
      await Promise.all([
        this.primary.signOut(),
        this.secondary?.signOut(),
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

  // ========== Session Management ==========

  async getSession(): Promise<Session | null> {
    return this.currentState.session;
  }

  async refreshSession(): Promise<AuthResult> {
    this.updateState({ isLoading: true });

    const result = await this.primary.refreshSession();

    if (result.error) {
      this.updateState({ isLoading: false, error: result.error });
      return result;
    }

    if (result.session) {
      if (this.secondary) {
        await this.secondary.refreshSession();
      }

      this.updateState({
        user: result.user,
        session: result.session,
        isAuthenticated: true,
        isLoading: false,
      });
    }

    return result;
  }

  // ========== State Access ==========

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

  // ========== Event Subscription ==========

  onAuthStateChange(callback: AuthStateChangeCallback): Unsubscribe {
    this.stateChangeCallbacks.push(callback);
    callback(this.currentState);

    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  // ========== Provider Access ==========

  getPrimaryProvider(): IPrimaryProvider {
    return this.primary;
  }

  getSecondaryProvider(): ISecondaryProvider | undefined {
    return this.secondary;
  }

  getSyncEngine(): SyncEngine | undefined {
    return this.syncEngine;
  }

  // ========== Private Methods ==========

  private updateState(partial: Partial<AuthState>): void {
    this.currentState = { ...this.currentState, ...partial };
    this.notifyStateChange();
  }

  private notifyStateChange(): void {
    this.stateChangeCallbacks.forEach((callback) => {
      try {
        callback(this.currentState);
      } catch (error) {
        console.error('Auth state change callback error:', error);
      }
    });
  }

  private handleProviderStateChange(
    _provider: 'primary' | 'secondary',
    state: AuthState
  ): void {
    if (state.user && !this.currentState.user) {
      this.updateState({
        user: state.user,
        session: state.session,
        isAuthenticated: state.isAuthenticated,
      });
    }
  }
}

/**
 * Create AuthOrchestrator from configuration
 * Convenience factory function
 */
export function createAuthOrchestrator(
  config: AuthConfig,
  overrides?: {
    primary?: IPrimaryProvider;
    secondary?: ISecondaryProvider;
  }
): AuthOrchestrator {
  const storage = createStorageAdapter(
    config.storage.type,
    config.storage.customProvider
  );

  const factory = ProviderFactory.getInstance();

  const primary = overrides?.primary || factory.createProvider(
    { type: 'supabase', config: config.supabase },
    storage
  ) as IPrimaryProvider;

  let secondary: ISecondaryProvider | undefined;
  if (config.directus) {
    secondary = overrides?.secondary || factory.createProvider(
      { type: 'directus', config: config.directus },
      storage
    ) as ISecondaryProvider;
  }

  return new AuthOrchestrator({
    primary,
    secondary,
    storage,
    sync: config.sync,
    wallet: config.wallet ? {
      enabled: true,
      ethereum: config.wallet.ethereum,
      solana: config.wallet.solana,
    } : undefined,
    app: config.app,
  });
}
