/**
 * React hooks for @whitelabel/auth
 * @whitelabel/auth/react
 */

import { useState, useEffect, useCallback, useContext, createContext } from 'react';
import { createAuthOrchestrator, AuthOrchestrator } from '../core/AuthOrchestrator.js';
import type { AuthConfig } from '../types/config.js';
import type { User, Session, AuthError, OAuthProvider, WalletType, AuthState } from '../types/auth.js';

// Create Auth Context
interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: AuthError | null;
  signInWithEmail: (email: string, password: string) => Promise<{ error?: AuthError }>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<{ error?: AuthError; pending?: boolean }>;
  signInWithMagicLink: (email: string, redirectTo?: string) => Promise<{ error?: Error }>;
  signInWithOTP: (email: string, phone?: string) => Promise<{ error?: Error }>;
  verifyOTP: (code: string, type: 'email' | 'sms', email?: string) => Promise<{ error?: AuthError }>;
  signInWithWallet: (type: WalletType) => Promise<{ error?: AuthError }>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  isWalletAvailable: (type: WalletType) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth Provider Component
interface AuthProviderProps {
  config: AuthConfig;
  children: React.ReactNode;
}

export function AuthProvider({ config, children }: AuthProviderProps): JSX.Element {
  const [authManager] = useState(() => createAuthOrchestrator(config));
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
    error: null,
  });

  useEffect(() => {
    const unsubscribe = authManager.onAuthStateChange((newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, [authManager]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const result = await authManager.signInWithEmailAndPassword(email, password);
      return { error: result.error };
    },
    [authManager]
  );

  const signInWithOAuth = useCallback(
    async (provider: OAuthProvider) => {
      const result = await authManager.signInWithOAuth(provider);
      return {
        error: result.error,
        pending: result.pending,
      };
    },
    [authManager]
  );

  const signInWithMagicLink = useCallback(
    async (email: string, redirectTo?: string) => {
      return authManager.signInWithMagicLink(email, redirectTo);
    },
    [authManager]
  );

  const signInWithOTP = useCallback(
    async (email: string, phone?: string) => {
      return authManager.signInWithOTP(email, phone);
    },
    [authManager]
  );

  const verifyOTP = useCallback(
    async (code: string, type: 'email' | 'sms', email?: string) => {
      const result = await authManager.verifyOTP(code, type, email);
      return { error: result.error };
    },
    [authManager]
  );

  const signInWithWallet = useCallback(
    async (type: WalletType) => {
      const result = await authManager.signInWithWallet(type);
      return { error: result.error };
    },
    [authManager]
  );

  const signOut = useCallback(async () => {
    await authManager.signOut();
  }, [authManager]);

  const refreshSession = useCallback(async () => {
    await authManager.refreshSession();
  }, [authManager]);

  const isWalletAvailable = useCallback(
    (type: WalletType) => {
      // This will be implemented by checking the wallet managers
      if (typeof window === 'undefined') return false;
      
      if (type === 'ethereum') {
        return !!(window as any).ethereum || !!(window as any).web3?.currentProvider;
      }
      
      if (type === 'solana') {
        return !!(window as any).solana || !!(window as any).solflare;
      }
      
      return false;
    },
    []
  );

  const value: AuthContextType = {
    user: state.user,
    session: state.session,
    isLoading: state.isLoading,
    isAuthenticated: state.isAuthenticated,
    error: state.error,
    signInWithEmail,
    signInWithOAuth,
    signInWithMagicLink,
    signInWithOTP,
    verifyOTP,
    signInWithWallet,
    signOut,
    refreshSession,
    isWalletAvailable,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// useAuth hook
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// useWalletAuth hook
interface UseWalletAuthReturn {
  isAvailable: (type: WalletType) => boolean;
  signIn: (type: WalletType) => Promise<{ error?: AuthError }>;
  isLoading: boolean;
}

export function useWalletAuth(): UseWalletAuthReturn {
  const auth = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const signIn = useCallback(
    async (type: WalletType) => {
      setIsLoading(true);
      const result = await auth.signInWithWallet(type);
      setIsLoading(false);
      return result;
    },
    [auth]
  );

  return {
    isAvailable: auth.isWalletAvailable,
    signIn,
    isLoading,
  };
}

// useSession hook
interface UseSessionReturn {
  session: Session | null;
  user: User | null;
  isAuthenticated: boolean;
  refresh: () => Promise<void>;
}

export function useSession(): UseSessionReturn {
  const auth = useAuth();

  return {
    session: auth.session,
    user: auth.user,
    isAuthenticated: auth.isAuthenticated,
    refresh: auth.refreshSession,
  };
}

// useAuthGuard hook for protected routes
interface UseAuthGuardReturn {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
}

export function useAuthGuard(requireAuth: boolean = true): UseAuthGuardReturn {
  const auth = useAuth();

  useEffect(() => {
    if (!auth.isLoading && requireAuth && !auth.isAuthenticated) {
      // Could redirect to login page here
      // Or throw an error that can be caught by an error boundary
    }
  }, [auth.isLoading, auth.isAuthenticated, requireAuth]);

  return {
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    user: auth.user,
  };
}

// useOAuthCallback hook for handling OAuth redirects
interface UseOAuthCallbackReturn {
  handleCallback: (params: Record<string, string>) => Promise<{ error?: AuthError; user?: User }>;
  isLoading: boolean;
}

export function useOAuthCallback(): UseOAuthCallbackReturn {
  const [authManager] = useState(() => {
    // This is a bit of a hack - we need to get the auth manager from context
    // but we can't use useContext here because this might be called before AuthProvider
    // In practice, this should be used within an AuthProvider
    return null as unknown as AuthManager;
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleCallback = useCallback(
    async (params: Record<string, string>) => {
      setIsLoading(true);
      // This will be called from within AuthProvider, so we should have access
      // We need to get the authManager from context instead
      setIsLoading(false);
      return { error: new Error('Not implemented - use within AuthProvider') };
    },
    []
  );

  return {
    handleCallback,
    isLoading,
  };
}

// Re-export types
export type { AuthContextType, AuthProviderProps, UseWalletAuthReturn, UseSessionReturn, UseAuthGuardReturn, UseOAuthCallbackReturn };
