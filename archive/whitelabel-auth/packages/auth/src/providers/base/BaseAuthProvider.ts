/**
 * Base authentication provider abstract class
 * @whitelabel/auth
 */

import type {
  User,
  Session,
  AuthResult,
  AuthStateChangeCallback,
  Unsubscribe,
  AuthProvider,
  StorageAdapter,
  OAuthProvider,
} from '../types/auth.js';

export abstract class BaseAuthProvider {
  abstract readonly name: AuthProvider;
  protected storage: StorageAdapter;
  protected stateChangeCallbacks: AuthStateChangeCallback[] = [];

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  // Core authentication methods
  abstract signInWithEmailAndPassword(email: string, password: string): Promise<AuthResult>;
  abstract signInWithOAuth?(provider: OAuthProvider): Promise<AuthResult>;
  abstract signInWithMagicLink?(email: string, redirectTo?: string): Promise<{ error?: Error }>;
  abstract signInWithOTP?(email: string, phone?: string): Promise<{ error?: Error }>;
  abstract verifyOTP?(code: string, type: 'email' | 'sms'): Promise<AuthResult>;
  
  // Session management
  abstract getSession(): Promise<Session | null>;
  abstract refreshSession(): Promise<AuthResult>;
  abstract signOut(): Promise<void>;
  
  // State checks
  abstract isAuthenticated(): boolean;
  abstract getUser(): User | null;
  
  // OAuth callback handling
  abstract handleOAuthCallback?(params: Record<string, string>): Promise<AuthResult>;
  
  // Event subscription
  onAuthStateChange(callback: AuthStateChangeCallback): Unsubscribe {
    this.stateChangeCallbacks.push(callback);
    
    // Immediately call with current state
    const currentSession = this.getSession();
    callback({
      user: this.getUser(),
      session: currentSession instanceof Promise ? null : currentSession,
      isLoading: false,
      isAuthenticated: this.isAuthenticated(),
      error: null,
    });
    
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }
  
  protected notifyStateChange(state: {
    user: User | null;
    session: Session | null;
    isLoading?: boolean;
    isAuthenticated?: boolean;
    error?: Error | null;
  }): void {
    const fullState = {
      user: state.user,
      session: state.session,
      isLoading: state.isLoading ?? false,
      isAuthenticated: state.isAuthenticated ?? (state.user !== null),
      error: state.error || null,
    };
    
    this.stateChangeCallbacks.forEach(callback => {
      try {
        callback(fullState);
      } catch (error) {
        console.error('Auth state change callback error:', error);
      }
    });
  }
  
  // Session storage helpers
  protected async getStoredSession(): Promise<Session | null> {
    try {
      const stored = await this.storage.getItem(`whitelabel_auth_session_${this.name}`);
      if (!stored) return null;
      return JSON.parse(stored) as Session;
    } catch {
      return null;
    }
  }
  
  protected async storeSession(session: Session): Promise<void> {
    try {
      await this.storage.setItem(
        `whitelabel_auth_session_${this.name}`,
        JSON.stringify(session)
      );
    } catch (error) {
      console.error('Failed to store session:', error);
    }
  }
  
  protected async clearStoredSession(): Promise<void> {
    try {
      await this.storage.removeItem(`whitelabel_auth_session_${this.name}`);
    } catch (error) {
      console.error('Failed to clear session:', error);
    }
  }
}
