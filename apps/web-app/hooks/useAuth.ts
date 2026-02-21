import { useCallback, useEffect, useState, useRef } from 'react';
import { authService, AuthSession, AuthUser } from '@hashpass/auth';

let sessionBootstrapPromise: Promise<AuthSession | null> | null = null;
let oauthHashProcessingPromise: Promise<void> | null = null;
let oauthHashProcessed = false;

export const useAuth = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const isInitializedRef = useRef(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Prevent duplicate initialization
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    // Check for OAuth tokens in URL fragment on page load (for direct redirects from OAuth).
    // Process this once globally to avoid duplicate callback handling from many mounted components.
    if (typeof window !== 'undefined' && window.location.hash && !oauthHashProcessed && !oauthHashProcessingPromise) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const access_token = hashParams.get('access_token');
      const refresh_token = hashParams.get('refresh_token');
      const email = hashParams.get('email');

      if (access_token) {
        const callbackHandler = authService.handleOAuthCallback;
        if (callbackHandler) {
          oauthHashProcessed = true;
          oauthHashProcessingPromise = callbackHandler({
            access_token,
            refresh_token: refresh_token || '',
            email: email || '',
            oauth_success: 'true'
          })
            .then((result) => {
              if (result?.error) {
                console.error('[useAuth] ❌ Failed to process OAuth tokens:', result.error);
                return;
              }

              window.history.replaceState(null, '', window.location.pathname + window.location.search);
            })
            .catch((error) => {
              console.error('[useAuth] ❌ Error processing OAuth tokens:', error);
            })
            .finally(() => {
              oauthHashProcessingPromise = null;
            });
        }
      }
    }

    // Subscribe to auth state changes
    unsubscribeRef.current = authService.onAuthStateChange((session: AuthSession | null) => {
      setUser(session?.user ?? null);
      setIsLoggedIn(!!session?.user && authService.isAuthenticated());
      setIsLoading(false);
    });

    // Initialize session once globally to avoid repeated /users/me probes.
    if (!sessionBootstrapPromise) {
      sessionBootstrapPromise = authService.getSession();
    }
    sessionBootstrapPromise.catch((error) => {
      console.error('[useAuth] Session bootstrap failed:', error);
    });

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      isInitializedRef.current = false;
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authService.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      return await authService.signInWithEmailAndPassword(email, password);
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  }, []);

  const signInWithOAuth = useCallback(async (provider: 'google' | 'github' | 'facebook' | 'twitter') => {
    try {
      if (!authService.signInWithOAuth) {
        throw new Error('OAuth not supported by current auth provider');
      }
      
      const result = await authService.signInWithOAuth(provider);
      
      if (result.error) {
        throw new Error(result.error);
      }

      // For OAuth, the result might be pending (redirect in progress)
      return result;
    } catch (error) {
      console.error('Error signing in with OAuth:', error);
      throw error;
    }
  }, []);

  const handleOAuthCallback = useCallback(async (codeOrParams: string | Record<string, string>, state?: string) => {
    try {
      if (!authService.handleOAuthCallback) {
        throw new Error('OAuth callback not supported by current auth provider');
      }
      
      const result = await authService.handleOAuthCallback(codeOrParams, state);
      
      if (result.error) {
        throw new Error(result.error);
      }

      return result;
    } catch (error) {
      console.error('Error handling OAuth callback:', error);
      throw error;
    }
  }, []);

  return {
    user,
    isLoggedIn,
    isLoading,
    signOut,
    signIn,
    signInWithOAuth,
    handleOAuthCallback,
  };
};
