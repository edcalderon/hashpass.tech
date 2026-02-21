import { useCallback, useEffect, useState, useRef } from 'react';
import { authService, AuthSession, AuthUser } from '@hashpass/auth';
<<<<<<< Updated upstream
import { supabase } from '../lib/supabase';

let oauthHashProcessingPromise: Promise<void> | null = null;
let oauthHashProcessed = false;

const mapSupabaseUserToAuthUser = (candidate: any): AuthUser | null => {
  if (!candidate) return null;

  const email = typeof candidate.email === 'string' ? candidate.email : '';
  const fullName = typeof candidate.user_metadata?.full_name === 'string'
    ? candidate.user_metadata.full_name
    : '';
  const firstNameFromFullName = fullName.split(' ')[0] || '';
  const lastNameFromFullName = fullName.split(' ').slice(1).join(' ');

  return {
    id: candidate.id || '',
    email,
    first_name: candidate.user_metadata?.first_name || firstNameFromFullName || undefined,
    last_name: candidate.user_metadata?.last_name || lastNameFromFullName || undefined,
    role: candidate.user_metadata?.role || candidate.role || 'user',
    status: candidate.user_metadata?.status || 'active',
    last_access: candidate.last_sign_in_at || undefined,
    app_metadata: candidate.app_metadata,
    user_metadata: candidate.user_metadata,
    provider: 'supabase',
  };
};

=======

let sessionBootstrapPromise: Promise<AuthSession | null> | null = null;
let oauthHashProcessingPromise: Promise<void> | null = null;
let oauthHashProcessed = false;

>>>>>>> Stashed changes
export const useAuth = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const isInitializedRef = useRef(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
<<<<<<< Updated upstream
  const supabaseSubscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const directusSessionRef = useRef<AuthSession | null>(null);
  const supabaseSessionRef = useRef<any | null>(null);
  const isMountedRef = useRef(false);
  const bootstrapCompletedRef = useRef(false);

  const syncAuthState = useCallback((completeLoading = false) => {
    const directusSession = directusSessionRef.current;
    const directusAuthenticated = !!directusSession?.user && authService.isAuthenticated();
    const supabaseUser = mapSupabaseUserToAuthUser(supabaseSessionRef.current?.user);

    // Prefer Directus user data when both sessions are present.
    const activeUser = directusAuthenticated ? (directusSession?.user ?? null) : supabaseUser;

    setUser(activeUser);
    setIsLoggedIn(Boolean(directusAuthenticated || supabaseUser));
    if (completeLoading || bootstrapCompletedRef.current) {
      setIsLoading(false);
    }
  }, []);
=======
>>>>>>> Stashed changes

  useEffect(() => {
    // Prevent duplicate initialization
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;
<<<<<<< Updated upstream
    isMountedRef.current = true;

    // Check for OAuth tokens in URL fragment on page load (for direct redirects from OAuth).
    // Process this once globally to avoid duplicate callback handling from many mounted components.
    // IMPORTANT: Skip on /auth/callback — the callback component has its own dedicated
    // token extraction logic and needs the hash to still be present when its useEffect fires.
    const isCallbackPage = typeof window !== 'undefined' &&
      window.location.pathname.includes('/auth/callback');

    if (typeof window !== 'undefined' && window.location.hash && !oauthHashProcessed && !oauthHashProcessingPromise && !isCallbackPage) {
=======

    // Check for OAuth tokens in URL fragment on page load (for direct redirects from OAuth).
    // Process this once globally to avoid duplicate callback handling from many mounted components.
    if (typeof window !== 'undefined' && window.location.hash && !oauthHashProcessed && !oauthHashProcessingPromise) {
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
      directusSessionRef.current = session;
      if (isMountedRef.current) {
        syncAuthState();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      supabaseSessionRef.current = session ?? null;
      if (isMountedRef.current) {
        syncAuthState();
      }
    });
    supabaseSubscriptionRef.current = subscription;

    // Initialize session once globally to avoid repeated /users/me probes.
    const initializeSessions = async () => {
      let directusSession: AuthSession | null = null;
      let supabaseSession: any = null;

      try {
        [directusSession, supabaseSession] = await Promise.all([
          authService.getSession().catch((error) => {
            console.error('[useAuth] Session bootstrap failed:', error);
            return null;
          }),
          supabase.auth.getSession()
            .then(({ data, error }) => {
              if (error) {
                console.error('[useAuth] Supabase session bootstrap failed:', error);
                return null;
              }
              return data.session ?? null;
            })
            .catch((error) => {
              console.error('[useAuth] Supabase session bootstrap failed:', error);
              return null;
            }),
        ]);
      } finally {
        directusSessionRef.current = directusSession;
        supabaseSessionRef.current = supabaseSession;
        bootstrapCompletedRef.current = true;
        if (isMountedRef.current) {
          syncAuthState(true);
        }
      }
    };

    initializeSessions().catch((error) => {
      console.error('[useAuth] Initialization failed:', error);
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    });

    return () => {
      isMountedRef.current = false;
=======
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
>>>>>>> Stashed changes
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
<<<<<<< Updated upstream
      if (supabaseSubscriptionRef.current) {
        supabaseSubscriptionRef.current.unsubscribe();
        supabaseSubscriptionRef.current = null;
      }
      isInitializedRef.current = false;
    };
  }, [syncAuthState]);

  const signOut = useCallback(async () => {
    const errors: string[] = [];

    try {
      const [directusSignOutResult, supabaseSignOutResult] = await Promise.allSettled([
        authService.signOut(),
        supabase.auth.signOut(),
      ]);

      if (directusSignOutResult.status === 'rejected') {
        errors.push(`Directus sign-out failed: ${String(directusSignOutResult.reason)}`);
      }

      if (supabaseSignOutResult.status === 'rejected') {
        errors.push(`Supabase sign-out failed: ${String(supabaseSignOutResult.reason)}`);
      } else if (supabaseSignOutResult.value?.error) {
        errors.push(`Supabase sign-out failed: ${supabaseSignOutResult.value.error.message}`);
      }
    } catch (error) {
      console.error('Error signing out:', error);
      errors.push(error instanceof Error ? error.message : String(error));
    } finally {
      directusSessionRef.current = null;
      supabaseSessionRef.current = null;
      if (isMountedRef.current) {
        syncAuthState();
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join(' | '));
    }
  }, [syncAuthState]);
=======
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
>>>>>>> Stashed changes

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
<<<<<<< Updated upstream

      const result = await authService.signInWithOAuth(provider);

=======
      
      const result = await authService.signInWithOAuth(provider);
      
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream

      const result = await authService.handleOAuthCallback(codeOrParams, state);

=======
      
      const result = await authService.handleOAuthCallback(codeOrParams, state);
      
>>>>>>> Stashed changes
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
