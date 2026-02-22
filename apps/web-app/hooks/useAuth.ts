import { useCallback, useEffect, useState, useRef } from 'react';
import { authService, AuthSession, AuthUser } from '@hashpass/auth';
import { supabase } from '../lib/supabase';

let sessionBootstrapPromise: Promise<AuthSession | null> | null = null;
let oauthHashProcessingPromise: Promise<void> | null = null;
let oauthHashProcessed = false;

type SupabaseBridgeType = 'magiclink' | 'recovery' | 'invite' | 'signup' | 'email' | 'email_change';

const normalizeSupabaseBridgeType = (rawType: string | null): SupabaseBridgeType => {
  const normalized = (rawType || 'magiclink').trim().toLowerCase();

  switch (normalized) {
    case 'email':
    case 'signup':
    case 'invite':
    case 'recovery':
    case 'email_change':
      return normalized;
    case 'email_change_new':
      return 'email_change';
    default:
      return 'magiclink';
  }
};

const completeSupabaseBridgeSession = async (
  tokenHash: string,
  typeRaw: string | null,
  emailRaw: string
) => {
  const email = emailRaw.trim().toLowerCase();
  if (!tokenHash || !email) {
    return;
  }

  const bridgeType = normalizeSupabaseBridgeType(typeRaw);
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: bridgeType,
    email,
  });

  if (error) {
    throw error;
  }
};

const mapSupabaseUserToAuthUser = (supabaseUser: any): AuthUser => ({
  id: supabaseUser.id,
  email: supabaseUser.email || '',
  first_name:
    supabaseUser.user_metadata?.first_name ||
    supabaseUser.user_metadata?.full_name?.split(' ')[0] ||
    '',
  last_name:
    supabaseUser.user_metadata?.last_name ||
    supabaseUser.user_metadata?.full_name?.split(' ').slice(1).join(' ') ||
    '',
  role: supabaseUser.role || supabaseUser.user_metadata?.role || 'authenticated',
  status: 'active',
});

export const useAuth = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const isInitializedRef = useRef(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const supabaseUnsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Prevent duplicate initialization
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    // Check for OAuth tokens in URL fragment on page load (for direct redirects from OAuth).
    // Process this once globally to avoid duplicate callback handling from many mounted components.
    if (typeof window !== 'undefined' && window.location.hash && !oauthHashProcessed && !oauthHashProcessingPromise) {
      const isAuthCallbackRoute = window.location.pathname.includes('/auth/callback');
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const access_token = hashParams.get('access_token');
      const refresh_token = hashParams.get('refresh_token');
      const email = hashParams.get('email');
      const supabaseBridgeTokenHash = hashParams.get('sb_token_hash');
      const supabaseBridgeType = hashParams.get('sb_type');
      const supabaseBridgeEmail = hashParams.get('sb_email');
      const signInMethod = window.localStorage.getItem('auth_signin_method');
      const isPasswordlessMethod = signInMethod === 'magic_link' || signInMethod === 'otp_code';

      // All callbacks on /auth/callback are handled there to avoid routing/token race conditions.
      // Keep this bootstrap path only for legacy redirects that land directly on /auth with a token hash.
      if (!isAuthCallbackRoute && !isPasswordlessMethod && access_token && authService.handleOAuthCallback) {
        oauthHashProcessed = true;
        oauthHashProcessingPromise = authService.handleOAuthCallback({
          access_token,
          refresh_token: refresh_token || '',
          email: email || '',
          oauth_success: 'true'
        })
          .then(async (result) => {
            if (result?.error) {
              console.error('[useAuth] ❌ Failed to process OAuth tokens:', result.error);
              return;
            }

            if (supabaseBridgeTokenHash) {
              const bridgeEmail = (supabaseBridgeEmail || email || result?.user?.email || '').trim().toLowerCase();
              if (!bridgeEmail) {
                console.warn('[useAuth] ⚠️ Supabase bridge token provided without a valid email.');
              } else {
                try {
                  await completeSupabaseBridgeSession(
                    supabaseBridgeTokenHash,
                    supabaseBridgeType,
                    bridgeEmail
                  );
                  console.log('[useAuth] ✅ Supabase dual-session bridge established.');
                } catch (bridgeError: any) {
                  console.warn(
                    '[useAuth] ⚠️ Supabase dual-session bridge failed:',
                    bridgeError?.message || String(bridgeError)
                  );
                }
              }
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

    let directusReady = false;
    let supabaseReady = false;
    let directusBootstrapFinished = false;
    let supabaseBootstrapFinished = false;
    let directusUser: AuthUser | null = null;
    let supabaseUser: AuthUser | null = null;
    let isDirectusLoggedIn = false;
    let isSupabaseLoggedIn = false;

    const syncDirectusStateFromProvider = (sessionFallback?: AuthSession | null) => {
      const providerUser = authService.getUser?.() ?? null;
      const fallbackUser = sessionFallback?.user ?? null;
      const resolvedUser = providerUser || fallbackUser;
      const isAuthenticated = authService.isAuthenticated();

      directusUser = isAuthenticated ? resolvedUser : null;
      isDirectusLoggedIn = isAuthenticated && !!resolvedUser;
    };

    const applyCombinedAuthState = () => {
      const ready = directusReady && supabaseReady;
      const loggedIn = isDirectusLoggedIn || isSupabaseLoggedIn;
      const resolvedUser = isDirectusLoggedIn ? directusUser : supabaseUser;

      setUser(resolvedUser);
      setIsLoggedIn(loggedIn);
      setIsLoading(!ready);
    };

    // Subscribe to Directus/provider state changes
    unsubscribeRef.current = authService.onAuthStateChange((session: AuthSession | null) => {
      syncDirectusStateFromProvider(session);

      // Keep global bootstrap result aligned with the latest auth transition for newly mounted hooks.
      if (isDirectusLoggedIn && session) {
        sessionBootstrapPromise = Promise.resolve(session);
      } else if (directusBootstrapFinished && !isDirectusLoggedIn) {
        sessionBootstrapPromise = Promise.resolve(null);
      }

      // Ignore initial null callback until bootstrap resolves to avoid false "logged out" redirects.
      if (!directusBootstrapFinished && !isDirectusLoggedIn) {
        return;
      }
      directusReady = true;
      applyCombinedAuthState();
    });

    // Subscribe to Supabase state changes (needed for passwordless and dual-session bridge).
    const { data: supabaseSub } = supabase.auth.onAuthStateChange((_event, session) => {
      supabaseUser = session?.user ? mapSupabaseUserToAuthUser(session.user) : null;
      isSupabaseLoggedIn = !!session?.user;
      // Ignore initial null callback until bootstrap resolves to avoid false "logged out" redirects.
      if (!supabaseBootstrapFinished && !session?.user) {
        return;
      }
      supabaseReady = true;
      applyCombinedAuthState();
    });
    supabaseUnsubscribeRef.current = () => supabaseSub.subscription.unsubscribe();

    // Initialize session once globally to avoid repeated /users/me probes.
    if (!sessionBootstrapPromise) {
      sessionBootstrapPromise = authService.getSession();
    }
    sessionBootstrapPromise
      .then((session) => {
        syncDirectusStateFromProvider(session);
      })
      .catch((error) => {
        console.error('[useAuth] Session bootstrap failed:', error);
        syncDirectusStateFromProvider(null);
      })
      .finally(() => {
        directusBootstrapFinished = true;
        directusReady = true;
        applyCombinedAuthState();
      });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        supabaseUser = data.session?.user ? mapSupabaseUserToAuthUser(data.session.user) : null;
        isSupabaseLoggedIn = !!data.session?.user;
      })
      .catch((error) => {
        console.error('[useAuth] Supabase session bootstrap failed:', error);
      })
      .finally(() => {
        supabaseBootstrapFinished = true;
        supabaseReady = true;
        applyCombinedAuthState();
      });

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      if (supabaseUnsubscribeRef.current) {
        supabaseUnsubscribeRef.current();
        supabaseUnsubscribeRef.current = null;
      }
      isInitializedRef.current = false;
    };
  }, []);

  const signOut = useCallback(async () => {
    const results = await Promise.allSettled([
      authService.signOut(),
      supabase.auth.signOut(),
    ]);

    const firstRejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );

    if (firstRejected) {
      console.error('Error signing out:', firstRejected.reason);
      throw firstRejected.reason;
    }

    sessionBootstrapPromise = Promise.resolve(null);
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
