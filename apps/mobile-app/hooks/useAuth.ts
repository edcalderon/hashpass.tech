import { useCallback, useEffect, useState, useRef } from 'react';
import { authService, BetterAuthProvider, getSupabaseOAuthRedirectUrl } from '@hashpass/auth';
import type { AuthSession, AuthUser, IAuthProvider } from '@hashpass/auth';
import { configureAuthService } from '@hashpass/auth/auth-dependencies';
import { createSessionFromUrl, supabase } from '../lib/supabase';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import {
  clearNativeGoogleAccount,
  nativeGoogleSigninStatusCodes,
  signInWithNativeGoogleAccount,
} from '../lib/native-google-signin';
import { shouldUseNativeGoogleSignin } from '../lib/native-google-signin-config';
import { mergeOAuthFragmentParams } from '../lib/auth/oauth/callback-params';
import { resolveGoogleOAuthClientId } from '../lib/auth/oauth/google-credentials';
import { resolvePublicSupabaseConfig } from '../config/supabase-profiles';

// Reuse the app's Supabase singleton (lib/supabase.ts) instead of letting
// @hashpass/auth build a second GoTrueClient against the same project.
// Two independent clients sharing one storage key ("Multiple GoTrueClient
// instances" warning) can race on session refresh and cause intermittent
// unexpected sign-outs. authService resolves lazily, so this only needs to
// run before the first call below — it does not need to win an import race.
configureAuthService({ supabaseClient: supabase });

let sessionBootstrapPromise: Promise<AuthSession | null> | null = null;
let oauthHashProcessingPromise: Promise<void> | null = null;
let oauthHashProcessed = false;

// Dedicated Better Auth instance for web Google sign-in when the tenant's
// primary provider (authService) is NOT better-auth (e.g. core/hashpass.tech,
// which still resolves to 'directus' for email/password + OTP). Reused as a
// singleton so we never open more than one Better Auth session client for
// this purpose. When authService's own provider IS 'better-auth' (BSL
// tenants), reuse authService directly instead of creating a second instance.
let googleBetterAuthProvider: BetterAuthProvider | null = null;
const getGoogleBetterAuthProvider = (): BetterAuthProvider => {
  if (!googleBetterAuthProvider) {
    googleBetterAuthProvider = new BetterAuthProvider();
  }
  return googleBetterAuthProvider;
};

const getWebBetterAuthProvider = (): IAuthProvider => {
  const providerName = authService.getProviderName();
  return providerName === 'better-auth' ? authService : getGoogleBetterAuthProvider();
};

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

const hasPublicSupabaseAuthConfig = (): boolean => {
  const { supabaseUrl, supabaseAnonKey } = resolvePublicSupabaseConfig();
  return Boolean(supabaseUrl && supabaseAnonKey);
};

export const useAuth = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const isInitializedRef = useRef(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const betterAuthUnsubscribeRef = useRef<(() => void) | null>(null);
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
        const callbackParams = mergeOAuthFragmentParams(hashParams, {
          access_token: access_token || '',
          refresh_token: refresh_token || '',
          email: email || '',
          oauth_success: 'true',
        });
        oauthHashProcessingPromise = authService.handleOAuthCallback({
          ...callbackParams,
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
    let betterAuthReady = false;
    let supabaseReady = false;
    let directusBootstrapFinished = false;
    let betterAuthBootstrapFinished = false;
    let supabaseBootstrapFinished = false;
    let directusUser: AuthUser | null = null;
    let betterAuthUser: AuthUser | null = null;
    let supabaseUser: AuthUser | null = null;
    let isDirectusLoggedIn = false;
    let isBetterAuthLoggedIn = false;
    let isSupabaseLoggedIn = false;
    let legacyBootstrapStarted = false;

    const syncDirectusStateFromProvider = (sessionFallback?: AuthSession | null) => {
      const providerUser = authService.getUser?.() ?? null;
      const fallbackUser = sessionFallback?.user ?? null;
      const resolvedUser = providerUser || fallbackUser;
      const isAuthenticated = authService.isAuthenticated();

      directusUser = isAuthenticated ? resolvedUser : null;
      isDirectusLoggedIn = isAuthenticated && !!resolvedUser;
    };

    const syncBetterAuthStateFromProvider = (sessionFallback?: AuthSession | null) => {
      betterAuthUser = sessionFallback?.user ?? null;
      isBetterAuthLoggedIn = !!sessionFallback?.user;
    };

    const applyCombinedAuthState = () => {
      const ready = directusReady && betterAuthReady && supabaseReady;
      const loggedIn = isBetterAuthLoggedIn || isDirectusLoggedIn || isSupabaseLoggedIn;
      const resolvedUser = isBetterAuthLoggedIn
        ? betterAuthUser
        : isDirectusLoggedIn
          ? directusUser
          : supabaseUser;

      setUser(resolvedUser);
      setIsLoggedIn(loggedIn);
      setIsLoading(!ready);
    };

    const betterAuthProvider = Platform.OS === 'web' ? getWebBetterAuthProvider() : null;

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

    if (betterAuthProvider) {
      betterAuthUnsubscribeRef.current = betterAuthProvider.onAuthStateChange((session: AuthSession | null) => {
        syncBetterAuthStateFromProvider(session);

        // Ignore the initial null callback until bootstrap resolves to avoid
        // false "logged out" redirects during the first Better Auth probe.
        if (!betterAuthBootstrapFinished && !isBetterAuthLoggedIn) {
          return;
        }

        betterAuthReady = true;
        applyCombinedAuthState();
      });
    }

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

    const startLegacyBootstrap = () => {
      if (legacyBootstrapStarted) return;
      legacyBootstrapStarted = true;

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
    };

    if (betterAuthProvider) {
      betterAuthProvider
        .getSession()
        .then((session: AuthSession | null) => {
          syncBetterAuthStateFromProvider(session);

          if (session?.user) {
            betterAuthBootstrapFinished = true;
            betterAuthReady = true;
            directusBootstrapFinished = true;
            directusReady = true;
            supabaseBootstrapFinished = true;
            supabaseReady = true;
            applyCombinedAuthState();
            return;
          }

          startLegacyBootstrap();
        })
        .catch((error: any) => {
          console.error('[useAuth] Better Auth session bootstrap failed:', error);
          syncBetterAuthStateFromProvider(null);
          startLegacyBootstrap();
        })
        .finally(() => {
          betterAuthBootstrapFinished = true;
          betterAuthReady = true;
          applyCombinedAuthState();
        });
    } else {
      betterAuthBootstrapFinished = true;
      betterAuthReady = true;
      startLegacyBootstrap();
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      if (supabaseUnsubscribeRef.current) {
        supabaseUnsubscribeRef.current();
        supabaseUnsubscribeRef.current = null;
      }
      if (betterAuthUnsubscribeRef.current) {
        betterAuthUnsubscribeRef.current();
        betterAuthUnsubscribeRef.current = null;
      }
      isInitializedRef.current = false;
    };
  }, []);

  const signOut = useCallback(async () => {
    // Clear native Google Sign-In cache so the account picker always shows on next login.
    // Must run before app sign-out to avoid the SDK being in a bad state.
    if (shouldUseNativeGoogleSignin(resolveGoogleOAuthClientId())) {
      await clearNativeGoogleAccount();
    }

    const webBetterAuthProvider =
      Platform.OS === 'web' && authService.getProviderName() !== 'better-auth'
        ? getGoogleBetterAuthProvider()
        : null;

    const results = await Promise.allSettled([
      authService.signOut(),
      webBetterAuthProvider?.signOut() ?? Promise.resolve(undefined),
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
      const googleWebClientId = resolveGoogleOAuthClientId();
      const providerName = authService.getProviderName();
      // Native-only: whether the Supabase ID-token SDK path is available. Web no
      // longer uses this — see the Better Auth branch below.
      const nativeSupabaseGoogleAvailable =
        provider === 'google' &&
        providerName !== 'better-auth' &&
        hasPublicSupabaseAuthConfig();

      const clearStaleProviderSession = async (skipProviders: 'better-auth' | 'supabase' | ('better-auth' | 'supabase')[]) => {
        const skipList = Array.isArray(skipProviders) ? skipProviders : [skipProviders];
        if (skipList.includes(providerName as 'better-auth' | 'supabase')) {
          return;
        }

        try {
          await authService.signOut();
        } catch (clearError) {
          console.warn('[useAuth] Failed to clear previous provider session before Google sign-in:', clearError);
        } finally {
          sessionBootstrapPromise = Promise.resolve(null);
        }
      };

      // ── Web Google Sign-In: Better Auth only ───────────────────────────────────
      // Better Auth is the canonical social-login backend for both core
      // (hashpass.tech) and BSL tenants. Never call Supabase's OAuth directly as
      // the primary path — that produced two divergent Google identities for the
      // same user (one under Better Auth's ba_users, one under Supabase auth.users)
      // depending on which host happened to be resolved.
      if (Platform.OS === 'web' && provider === 'google') {
        await clearStaleProviderSession('better-auth');

        const betterAuthGoogle: IAuthProvider =
          providerName === 'better-auth' ? authService : getGoogleBetterAuthProvider();

        const result = await betterAuthGoogle.signInWithOAuth!('google');
        if (result.error) {
          throw new Error(result.error);
        }

        return result;
      }

      // ── Native Google Sign-In (SDK path, feature-flagged) ──────────────────────
      // Use the system account picker to get an ID token, then exchange it with
      // Better Auth first (same precedence as web — one Google identity per user,
      // not two divergent ones), falling back to Supabase's signInWithIdToken only
      // if Better Auth's own exchange fails. Enabled even if the app's primary
      // provider is Directus. Disabled or unavailable → falls through to the
      // provider OAuth flow below.
      const nativeGoogleEnabled =
        provider === 'google' &&
        Platform.OS !== 'web' &&
        nativeSupabaseGoogleAvailable &&
        shouldUseNativeGoogleSignin(googleWebClientId);

      if (nativeGoogleEnabled) {
        try {
          const { idToken } = await signInWithNativeGoogleAccount();
          // Native's two-tier attempt (Better Auth, then Supabase) ends up on
          // one of these two either way, so only clear a session belonging to
          // neither — e.g. a stale Directus session — not one that's already
          // a valid outcome of this same flow.
          await clearStaleProviderSession(['better-auth', 'supabase']);

          // nativeGoogleEnabled already implies providerName !== 'better-auth'
          // (via nativeSupabaseGoogleAvailable above), so authService can never
          // already be Better Auth here — always use the dedicated instance.
          try {
            const betterAuthResult = await getGoogleBetterAuthProvider().signInWithIdToken('google', idToken);
            if (!betterAuthResult.error) {
              sessionBootstrapPromise = Promise.resolve(betterAuthResult.session ?? null);
              return betterAuthResult;
            }
            console.warn('[useAuth] Better Auth native Google sign-in failed, falling back to Supabase:', betterAuthResult.error);
          } catch (betterAuthError) {
            console.warn('[useAuth] Better Auth native Google sign-in threw, falling back to Supabase:', betterAuthError);
          }

          const { error: signInError } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: idToken,
          });
          if (signInError) throw signInError;
          sessionBootstrapPromise = Promise.resolve(null);
          return { pending: true };
        } catch (err: any) {
          const errorCode = err?.code;
          const nativeInProgressCode = (nativeGoogleSigninStatusCodes as Record<string, string | undefined>).IN_PROGRESS;
          const message = err?.message || '';
          const isUserDismissal =
            errorCode === nativeGoogleSigninStatusCodes.SIGN_IN_CANCELLED ||
            /cancel/i.test(message);

          if (isUserDismissal || (nativeInProgressCode && errorCode === nativeInProgressCode)) {
            return { pending: false };
          }
          if (errorCode === nativeGoogleSigninStatusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
            console.warn('[useAuth] Play Services unavailable, falling back to browser OAuth');
            // fall through to provider-specific OAuth flow below
          } else if (errorCode === 'GOOGLE_ID_TOKEN_MISSING') {
            throw new Error(
              'Google sign-in completed, but the device did not return a usable ID token. Please try again.'
            );
          } else {
            throw err;
          }
        }
      }
      // ── End native Google Sign-In ───────────────────────────────────────────────

      if (!authService.signInWithOAuth) {
        throw new Error('OAuth not supported by current auth provider');
      }

      const result = await authService.signInWithOAuth(provider);

      if (result.error) {
        throw new Error(result.error);
      }

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
      const signInMethod =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? window.localStorage.getItem('auth_signin_method')
          : null;

      // Web Google sign-in always goes through Better Auth first (see
      // signInWithOAuth above). Its callback is cookie-based — Better Auth's
      // own server already consumed the code and set the session cookie
      // before redirecting here, so there's no code/token in the URL.
      // authService.handleOAuthCallback would resolve to the tenant's
      // primary provider (e.g. 'directus' for core on web) and misread that
      // empty params object as a failed callback for a provider that was
      // never actually used. Check for a live Better Auth session instead.
      if (Platform.OS === 'web' && signInMethod === 'google_oauth') {
        const providerName = authService.getProviderName();
        const betterAuthGoogle: IAuthProvider =
          providerName === 'better-auth' ? authService : getGoogleBetterAuthProvider();

        const betterAuthResult = await betterAuthGoogle.handleOAuthCallback!(codeOrParams, state);

        if (betterAuthResult.error) {
          throw new Error(betterAuthResult.error);
        }

        return betterAuthResult;
      }

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
