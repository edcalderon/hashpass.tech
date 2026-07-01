import { useCallback, useEffect, useState, useRef } from 'react';
import { authService, getSupabaseOAuthRedirectUrl } from '@hashpass/auth';
import type { AuthSession, AuthUser } from '@hashpass/auth';
import { createSessionFromUrl, supabase } from '../lib/supabase';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import {
  clearNativeGoogleAccount,
  nativeGoogleSigninStatusCodes,
  signInWithNativeGoogleAccount,
} from '../lib/native-google-signin';

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
  // Preserve these so profile screen can read avatar_url / created_at directly
  user_metadata: supabaseUser.user_metadata,
  created_at: supabaseUser.created_at,
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
    if (
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      window.location?.hash &&
      !oauthHashProcessed &&
      !oauthHashProcessingPromise
    ) {
      const location = window.location;
      const isAuthCallbackRoute = location.pathname.includes('/auth/callback');
      const hashParams = new URLSearchParams(location.hash.substring(1));
      const access_token = hashParams.get('access_token');
      const refresh_token = hashParams.get('refresh_token');
      const email = hashParams.get('email');
      const supabaseBridgeTokenHash = hashParams.get('sb_token_hash');
      const supabaseBridgeType = hashParams.get('sb_type');
      const supabaseBridgeEmail = hashParams.get('sb_email');
      const signInMethod = window.localStorage?.getItem('auth_signin_method');
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
          .then(async (result: any) => {
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

            window.history.replaceState(null, '', location.pathname + location.search);
          })
          .catch((error: any) => {
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
    const { data: supabaseSub } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
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
    const bootstrapPromise = sessionBootstrapPromise ?? (sessionBootstrapPromise = authService.getSession());
    bootstrapPromise
      .then((session: AuthSession | null) => {
        syncDirectusStateFromProvider(session);
      })
      .catch((error: any) => {
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
      .then(({ data }: any) => {
        supabaseUser = data.session?.user ? mapSupabaseUserToAuthUser(data.session.user) : null;
        isSupabaseLoggedIn = !!data.session?.user;
      })
      .catch((error: any) => {
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
    // Clear native Google Sign-In cache so the account picker always shows on next login.
    // Must run before app sign-out to avoid the SDK being in a bad state.
    if (Platform.OS !== 'web' && process.env.EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN === 'true') {
      await clearNativeGoogleAccount();
    }

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

      // ── Native Google Sign-In (SDK path, feature-flagged) ──────────────────────
      // When enabled, uses the system account picker with no browser popup.
      // Disabled → falls through to the WebBrowser block below (unchanged).
      const nativeGoogleEnabled =
        Platform.OS !== 'web' &&
        provider === 'google' &&
        process.env.EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN === 'true';

      if (nativeGoogleEnabled) {
        try {
          const { idToken } = await signInWithNativeGoogleAccount();

          const { error: signInError } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: idToken,
          });
          if (signInError) throw signInError;
          return { pending: true };
        } catch (err: any) {
          console.log('[GoogleSignin] error code:', err?.code, 'message:', err?.message);
          if (err.code === nativeGoogleSigninStatusCodes.SIGN_IN_CANCELLED) {
            return { pending: false };
          }
          if (err.code === nativeGoogleSigninStatusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
            console.warn('[useAuth] Play Services unavailable, falling back to browser OAuth');
            // fall through to WebBrowser block below
          } else {
            throw err;
          }
        }
      }
      // ── End native Google Sign-In ───────────────────────────────────────────────

      // On native, the provider returns a URL to open in the system browser
      if (Platform.OS !== 'web' && result.oauthUrl) {
        const callbackUrl = getSupabaseOAuthRedirectUrl();
        const browserResult = await WebBrowser.openAuthSessionAsync(
          result.oauthUrl,
          callbackUrl
        );

        if (browserResult.type !== 'success') {
          throw new Error('Google sign-in was cancelled before the browser returned to the app.');
        }

        if (!browserResult.url) {
          throw new Error('Google sign-in completed, but the app did not receive a callback URL.');
        }

        const providerName = authService.getProviderName();

        if (providerName === 'directus' && authService.handleOAuthCallback) {
          // Parse query params from the deep-link callback URL and hand them to the
          // Directus provider which extracts the access_token returned via mode=json.
          const callbackUrlObj = new URL(browserResult.url);
          const callbackParams: Record<string, string> = {};
          callbackUrlObj.searchParams.forEach((v, k) => { callbackParams[k] = v; });

          const callbackResult = await authService.handleOAuthCallback(callbackParams);
          if (callbackResult.error) {
            throw new Error(callbackResult.error);
          }
          return { pending: true };
        }

        // Supabase: extract tokens from URL fragment / query params
        const sessionResult = await createSessionFromUrl(browserResult.url);

        if (sessionResult.error) {
          throw sessionResult.error;
        }

        if (!sessionResult.session) {
          throw new Error('Google sign-in completed, but no Supabase session was created.');
        }

        return { pending: true };
      }

      if (Platform.OS !== 'web' && !result.oauthUrl) {
        throw new Error('Google sign-in could not start. Check the OAuth configuration.');
      }

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
