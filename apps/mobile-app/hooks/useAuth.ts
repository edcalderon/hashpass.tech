import { useCallback, useEffect, useState, useRef } from 'react';
import { authService, BetterAuthProvider, getSupabaseOAuthRedirectUrl } from '@hashpass/auth';
import type { AuthSession, AuthUser, IAuthProvider } from '@hashpass/auth';
import { configureAuthService } from '@hashpass/auth/auth-dependencies';
import { createSessionFromUrl, supabase } from '../lib/supabase';
import { Linking, Platform } from 'react-native';
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
import { markRecentAuthSuccess, clearRecentAuthSuccess } from '../lib/auth/recent-auth';
import {
  createAuthSessionActor,
  getAuthViewState,
  type AuthSessionMachineEvent,
  type AuthSessionMachineSnapshot,
  type AuthSessionProvider,
} from './auth-session-machine';

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

const mapSupabaseSessionToAuthSession = (session: any): AuthSession | null => {
  if (!session?.user) {
    return null;
  }

  return {
    user: mapSupabaseUserToAuthUser(session.user),
    access_token: session.access_token || '',
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    provider: 'supabase',
  };
};

type NativeOAuthBrowserResult = {
  type: string;
  url?: string;
  error?: unknown;
  source?: 'browser' | 'linking';
};

const normalizeOAuthCallbackPrefix = (value: string): string => {
  const [withoutHash] = value.split('#');
  const [withoutQuery] = withoutHash.split('?');
  return withoutQuery.replace(/\/+$/, '').toLowerCase();
};

const isExpectedNativeOAuthCallbackUrl = (url: string, callbackUrl: string): boolean => {
  const normalizedUrl = normalizeOAuthCallbackPrefix(url);
  const normalizedCallbackUrl = normalizeOAuthCallbackPrefix(callbackUrl);

  return (
    normalizedUrl === normalizedCallbackUrl ||
    normalizedUrl === 'hashpass://auth/callback' ||
    normalizedUrl === 'intent://auth/callback'
  );
};

const createNativeOAuthCallbackListener = (callbackUrl: string) => {
  if (Platform.OS === 'web' || typeof Linking?.addEventListener !== 'function') {
    return null;
  }

  let resolveCallbackUrl: (url: string) => void = () => {};
  const promise = new Promise<NativeOAuthBrowserResult>((resolve) => {
    resolveCallbackUrl = (url: string) => {
      resolve({ type: 'success', url, source: 'linking' });
    };
  });

  let subscription: { remove?: () => void } | null = null;
  try {
    subscription = Linking.addEventListener('url', (event: { url?: string }) => {
      const eventUrl = event?.url;
      if (typeof eventUrl === 'string' && isExpectedNativeOAuthCallbackUrl(eventUrl, callbackUrl)) {
        resolveCallbackUrl(eventUrl);
      }
    });
  } catch (listenerError: any) {
    console.warn('[useAuth] Native OAuth callback listener could not be registered:', {
      message: listenerError?.message || String(listenerError),
    });
    return null;
  }

  return {
    promise,
    cleanup: () => subscription?.remove?.(),
  };
};

const openNativeOAuthBrowserSession = async (
  oauthUrl: string,
  callbackUrl: string
): Promise<NativeOAuthBrowserResult> => {
  const callbackListener = createNativeOAuthCallbackListener(callbackUrl);
  const browserPromise = WebBrowser.openAuthSessionAsync(oauthUrl, callbackUrl)
    .then((result: NativeOAuthBrowserResult) => ({
      ...result,
      source: 'browser' as const,
    }))
    .catch((error: unknown) => ({
      type: 'error',
      error,
      source: 'browser' as const,
    }));

  try {
    const result = callbackListener
      ? await Promise.race([browserPromise, callbackListener.promise])
      : await browserPromise;

    if (result.source === 'linking' && typeof WebBrowser.dismissAuthSession === 'function') {
      try {
        WebBrowser.dismissAuthSession();
      } catch (dismissError: any) {
        console.warn('[useAuth] Native OAuth browser dismiss after Linking callback failed:', {
          message: dismissError?.message || String(dismissError),
        });
      }
    }

    return result;
  } finally {
    callbackListener?.cleanup();
  }
};

const hasPublicSupabaseAuthConfig = (): boolean => {
  const { supabaseUrl, supabaseAnonKey } = resolvePublicSupabaseConfig();
  return Boolean(supabaseUrl && supabaseAnonKey);
};

const normalizeNativeGoogleErrorCode = (code: unknown): string => {
  if (typeof code === 'string') {
    return code;
  }
  if (typeof code === 'number') {
    return String(code);
  }
  return '';
};

const getNativeGoogleAuthErrorDetails = (error: any) => ({
  code: normalizeNativeGoogleErrorCode(error?.code),
  message: error?.message || String(error || 'Unknown native Google auth error'),
  name: error?.name || 'Error',
});

const isNativeGoogleDeveloperConfigurationError = (errorCode: string, message: string): boolean =>
  errorCode === '10' ||
  /DEVELOPER_ERROR|not registered to use OAuth2\.0|package name and SHA-1 certificate fingerprint|package info is not set correctly/i.test(message);

const getAuthErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return fallback;
};

// GoTrue returns this for BOTH the OAuth-redirect flow and signInWithIdToken()
// when the provider toggle in Supabase Dashboard > Authentication > Providers
// is off — a config error, not a transient auth failure. It reads exactly like
// a normal failed sign-in to the end user, so this went unnoticed for days
// until someone happened to inspect a raw network response. Detect it and log
// it loudly/distinctly so it can't hide in generic "sign-in failed" noise again.
const isProviderDisabledError = (error: unknown): boolean => {
  const message = getAuthErrorMessage(error, '').toLowerCase();
  return message.includes('provider is not enabled') || message.includes('unsupported provider');
};

const warnIfProviderDisabled = (provider: string, error: unknown): void => {
  if (!isProviderDisabledError(error)) {
    return;
  }
  console.error(
    `🚨 [useAuth] CONFIG ERROR: Supabase reports the "${provider}" provider is disabled. ` +
      `This is not a transient failure — every sign-in attempt through this path will fail until fixed. ` +
      `Fix: Supabase Dashboard > Authentication > Providers > enable ${provider}.`,
    { rawMessage: getAuthErrorMessage(error, '') }
  );
};

export const useAuth = () => {
  const [authActor] = useState(() => createAuthSessionActor());
  const [authViewState, setAuthViewState] = useState(() =>
    getAuthViewState(authActor.getSnapshot())
  );
  const { user, isLoggedIn, isLoading } = authViewState;
  const isInitializedRef = useRef(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const betterAuthUnsubscribeRef = useRef<(() => void) | null>(null);
  const supabaseUnsubscribeRef = useRef<(() => void) | null>(null);
  const authenticatedSessionOverrideRef = useRef<AuthSession | null>(null);

  const sendAuthEvent = useCallback((event: AuthSessionMachineEvent) => {
    if (authActor.getSnapshot().status === 'stopped') {
      return;
    }

    authActor.send(event);
  }, [authActor]);

  useEffect(() => {
    const subscription = authActor.subscribe((snapshot: AuthSessionMachineSnapshot) => {
      setAuthViewState(getAuthViewState(snapshot));
    });

    authActor.start();
    setAuthViewState(getAuthViewState(authActor.getSnapshot()));

    return () => {
      subscription.unsubscribe();
      authActor.stop();
    };
  }, [authActor]);

  const applyAuthenticatedSession = useCallback((session?: AuthSession | null): boolean => {
    if (!session?.user) {
      return false;
    }

    authenticatedSessionOverrideRef.current = session;
    sendAuthEvent({ type: 'SESSION_OVERRIDE', session });
    return true;
  }, [sendAuthEvent]);

  useEffect(() => {
    // Prevent duplicate initialization
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;
    let isActive = true;

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

    let directusBootstrapFinished = false;
    let betterAuthBootstrapFinished = false;
    let supabaseBootstrapFinished = false;
    let legacyBootstrapStarted = false;

    const sendProviderResolved = (
      provider: AuthSessionProvider,
      state: {
        session?: AuthSession | null;
        user?: AuthUser | null;
        loggedIn?: boolean;
      }
    ) => {
      if (!isActive) {
        return;
      }

      sendAuthEvent({
        type: 'PROVIDER_RESOLVED',
        provider,
        session: state.session ?? null,
        user: state.user ?? null,
        loggedIn: state.loggedIn ?? Boolean(state.session?.user || state.user),
      });
    };

    const readDirectusStateFromProvider = (sessionFallback?: AuthSession | null) => {
      const providerUser = authService.getUser?.() ?? null;
      const fallbackUser = sessionFallback?.user ?? null;
      const resolvedUser = providerUser || fallbackUser;
      const isAuthenticated = authService.isAuthenticated();

      return {
        session: sessionFallback ?? null,
        user: isAuthenticated ? resolvedUser : null,
        loggedIn: isAuthenticated && !!resolvedUser,
      };
    };

    const readAuthSessionState = (session?: AuthSession | null) => ({
      session: session ?? null,
      user: session?.user ?? null,
      loggedIn: Boolean(session?.user),
    });

    const readSupabaseStateFromSession = (session?: any) => {
      const mappedSession = mapSupabaseSessionToAuthSession(session);

      return {
        session: mappedSession,
        user: mappedSession?.user ?? null,
        loggedIn: Boolean(mappedSession?.user),
      };
    };

    const shouldBootstrapNativeBetterAuth =
      Platform.OS !== 'web' && shouldUseNativeGoogleSignin(resolveGoogleOAuthClientId());
    const betterAuthProvider =
      Platform.OS === 'web'
        ? getWebBetterAuthProvider()
        : shouldBootstrapNativeBetterAuth
          ? getGoogleBetterAuthProvider()
          : null;

    // Subscribe to Directus/provider state changes
    unsubscribeRef.current = authService.onAuthStateChange((session: AuthSession | null) => {
      const directusState = readDirectusStateFromProvider(session);

      // Keep global bootstrap result aligned with the latest auth transition for newly mounted hooks.
      if (directusState.loggedIn && session) {
        sessionBootstrapPromise = Promise.resolve(session);
      } else if (directusBootstrapFinished && !directusState.loggedIn) {
        sessionBootstrapPromise = Promise.resolve(null);
      }

      // Ignore initial null callback until bootstrap resolves to avoid false "logged out" redirects.
      if (!directusBootstrapFinished && !directusState.loggedIn) {
        return;
      }

      sendProviderResolved('directus', directusState);
    });

    if (betterAuthProvider) {
      betterAuthUnsubscribeRef.current = betterAuthProvider.onAuthStateChange((session: AuthSession | null) => {
        const betterAuthState = readAuthSessionState(session);

        // Ignore the initial null callback until bootstrap resolves to avoid
        // false "logged out" redirects during the first Better Auth probe.
        if (!betterAuthBootstrapFinished && !betterAuthState.loggedIn) {
          return;
        }

        sendProviderResolved('betterAuth', betterAuthState);
      });
    }

    // Subscribe to Supabase state changes (needed for passwordless and dual-session bridge).
    const { data: supabaseSub } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
      const supabaseState = readSupabaseStateFromSession(session);
      // Ignore initial null callback until bootstrap resolves to avoid false "logged out" redirects.
      if (!supabaseBootstrapFinished && !supabaseState.loggedIn) {
        return;
      }

      sendProviderResolved('supabase', supabaseState);
    });
    supabaseUnsubscribeRef.current = () => supabaseSub.subscription.unsubscribe();

    const startLegacyBootstrap = () => {
      if (legacyBootstrapStarted) return;
      legacyBootstrapStarted = true;

      // Initialize session once globally to avoid repeated /users/me probes.
      const bootstrapPromise = sessionBootstrapPromise ?? (sessionBootstrapPromise = authService.getSession());
      bootstrapPromise
        .then((session: AuthSession | null) => {
          directusBootstrapFinished = true;
          sendProviderResolved('directus', readDirectusStateFromProvider(session));
        })
        .catch((error: any) => {
          console.error('[useAuth] Session bootstrap failed:', error);
          directusBootstrapFinished = true;
          sendProviderResolved('directus', readAuthSessionState(null));
        });

      supabase.auth
        .getSession()
        .then(({ data }: any) => {
          supabaseBootstrapFinished = true;
          sendProviderResolved('supabase', readSupabaseStateFromSession(data.session));
        })
        .catch((error: any) => {
          console.error('[useAuth] Supabase session bootstrap failed:', error);
          supabaseBootstrapFinished = true;
          sendProviderResolved('supabase', readAuthSessionState(null));
        });
    };

    if (betterAuthProvider) {
      let latestBetterAuthState = readAuthSessionState(null);

      betterAuthProvider
        .getSession()
        .then((session: AuthSession | null) => {
          latestBetterAuthState = readAuthSessionState(session);

          if (session?.user) {
            betterAuthBootstrapFinished = true;
            sendProviderResolved('betterAuth', latestBetterAuthState);
            directusBootstrapFinished = true;
            sendProviderResolved('directus', readAuthSessionState(null));
            // Resolve Supabase from its locally persisted session instead of
            // force-marking it logged-out: an OTP/magic-link user holds a real
            // Supabase session alongside Better Auth, and it must keep backing
            // isLoggedIn when a flaky native Better Auth getSession drops out.
            // (supabase.auth.getSession() reads local storage — no network.)
            supabase.auth
              .getSession()
              .then(({ data }: any) => {
                supabaseBootstrapFinished = true;
                sendProviderResolved('supabase', readSupabaseStateFromSession(data.session));
              })
              .catch(() => {
                supabaseBootstrapFinished = true;
                sendProviderResolved('supabase', readAuthSessionState(null));
              });
            return;
          }

          startLegacyBootstrap();
        })
        .catch((error: any) => {
          console.error('[useAuth] Better Auth session bootstrap failed:', error);
          latestBetterAuthState = readAuthSessionState(null);
          startLegacyBootstrap();
        })
        .finally(() => {
          betterAuthBootstrapFinished = true;
          sendProviderResolved('betterAuth', latestBetterAuthState);
        });
    } else {
      betterAuthBootstrapFinished = true;
      sendProviderResolved('betterAuth', readAuthSessionState(null));
      startLegacyBootstrap();
    }

    return () => {
      isActive = false;
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
  }, [sendAuthEvent]);

  const signOut = useCallback(async () => {
    authenticatedSessionOverrideRef.current = null;
    // Must run before the provider sign-outs below, not after: the root and
    // dashboard auth guards treat `isLoggedIn === false` as a possibly-transient
    // provider flap for AUTH_REDIRECT_GRACE_WINDOW_MS after a login, and in that
    // window they skip redirecting and instead force a fresh authService
    // getSession() re-check (see app/_layout.tsx and dashboard/_layout.tsx). If
    // a user explicitly signs out inside that same window, that "recheck"
    // fires anyway, and on native it can resolve a still-lingering provider
    // session (Better Auth/Supabase sign-out over a flaky native transport,
    // the same flakiness documented throughout the v1.8.234-239 auth crash
    // fixes, has no hard guarantee of finishing first) and silently
    // resurrect the session we just cleared, bouncing the user straight back
    // into the dashboard — this reads as "the Logout button does nothing."
    // Clearing the grace flag here removes the window entirely: once a
    // sign-out is in flight, isLoggedIn=false must always mean "redirect",
    // never "assume it'll come back".
    clearRecentAuthSuccess();
    const shouldSignOutNativeGoogle =
      Platform.OS !== 'web' && shouldUseNativeGoogleSignin(resolveGoogleOAuthClientId());

    // Clear native Google Sign-In cache so the account picker always shows on next login.
    // Must run before app sign-out to avoid the SDK being in a bad state.
    if (shouldSignOutNativeGoogle) {
      try {
        await clearNativeGoogleAccount();
      } catch (nativeClearError) {
        console.warn('[useAuth] Native Google account cache clear failed during sign-out:', nativeClearError);
      }
    }

    const dedicatedGoogleBetterAuthProvider =
      authService.getProviderName() !== 'better-auth' &&
      (Platform.OS === 'web' || shouldSignOutNativeGoogle)
        ? getGoogleBetterAuthProvider()
        : null;

    const results = await Promise.allSettled([
      authService.signOut(),
      dedicatedGoogleBetterAuthProvider?.signOut() ?? Promise.resolve(undefined),
      supabase.auth.signOut(),
    ]);

    const signOutFailures = results.map((result) => {
      if (result.status === 'rejected') {
        return result.reason;
      }

      const value = result.value as { error?: unknown } | undefined;
      return value?.error ?? null;
    }).filter((failure): failure is unknown => Boolean(failure));

    if (signOutFailures.length > 0) {
      console.warn(
        '[useAuth] Provider sign-out reported cleanup errors; clearing local auth state anyway:',
        signOutFailures.map((failure) => getAuthErrorMessage(failure, 'Unable to sign out.'))
      );
    }

    sessionBootstrapPromise = Promise.resolve(null);
    sendAuthEvent({ type: 'SIGNED_OUT' });
  }, [sendAuthEvent]);

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
      // Native-only: the SDK account picker still needs public Supabase config
      // so the compatibility fallback can create a mobile data session.
      const nativeGoogleAvailable =
        provider === 'google' &&
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
      // Better Auth first so native and web Google sign-in land on the same
      // identity. Supabase remains a native-only compatibility fallback.
      const nativeGoogleEnabled =
        provider === 'google' &&
        Platform.OS !== 'web' &&
        nativeGoogleAvailable &&
        shouldUseNativeGoogleSignin(googleWebClientId);

      if (nativeGoogleEnabled) {
        try {
          const { idToken } = await signInWithNativeGoogleAccount(googleWebClientId);
          // Native's two-tier attempt ends up on one of these two either way,
          // so only clear a session belonging to neither — e.g. a stale
          // Directus session — not one that's already a valid outcome.
          await clearStaleProviderSession(['better-auth', 'supabase']);

          let betterAuthPrimaryError: unknown = null;
          try {
            const betterAuthGoogle =
              providerName === 'better-auth'
                ? (authService as unknown as BetterAuthProvider)
                : getGoogleBetterAuthProvider();

            const betterAuthResult = await betterAuthGoogle.signInWithIdToken('google', idToken);
            if (betterAuthResult.error) {
              throw new Error(betterAuthResult.error);
            }

            const session =
              betterAuthResult.session ??
              (betterAuthResult.user
                ? {
                    user: betterAuthResult.user,
                    access_token: 'better_auth_session',
                    provider: 'better-auth',
                  }
                : null);

            if (!session?.user) {
              throw new Error('Google sign-in completed, but no Better Auth session was created.');
            }

            sessionBootstrapPromise = Promise.resolve(session);
            markRecentAuthSuccess();
            applyAuthenticatedSession(session);
            return {
              ...betterAuthResult,
              user: betterAuthResult.user ?? session.user,
              session,
            };
          } catch (betterAuthError) {
            betterAuthPrimaryError = betterAuthError;
            console.warn(
              '[useAuth] Better Auth native Google ID-token exchange failed, trying Supabase fallback:',
              betterAuthError
            );
          }

          try {
            const { data, error: signInError } = await supabase.auth.signInWithIdToken({
              provider: 'google',
              token: idToken,
            });
            if (signInError) throw signInError;

            const supabaseSession = mapSupabaseSessionToAuthSession(data?.session);
            if (!supabaseSession) {
              throw new Error('Google sign-in completed, but no Supabase session was created.');
            }

            sessionBootstrapPromise = Promise.resolve(supabaseSession);
            markRecentAuthSuccess();
            applyAuthenticatedSession(supabaseSession);
            return { user: supabaseSession.user, session: supabaseSession };
          } catch (supabaseError) {
            if (betterAuthPrimaryError) {
              console.warn('[useAuth] Supabase native Google fallback also failed:', supabaseError);
            }
            warnIfProviderDisabled('google', supabaseError);
            const supabaseMessage = getAuthErrorMessage(
              supabaseError,
              'Google sign-in failed after account selection. Please try again.'
            );
            console.error('[useAuth] Native Google ID-token exchange failed after account selection:', {
              betterAuthMessage: betterAuthPrimaryError
                ? getAuthErrorMessage(betterAuthPrimaryError, 'Better Auth exchange failed.')
                : null,
              supabaseMessage,
            });
            return { error: supabaseMessage };
          }
        } catch (err: any) {
          const { code: errorCode, message, name } = getNativeGoogleAuthErrorDetails(err);
          const nativeInProgressCode = (nativeGoogleSigninStatusCodes as Record<string, string | undefined>).IN_PROGRESS;
          const isDeveloperConfigurationError = isNativeGoogleDeveloperConfigurationError(errorCode, message);
          const isUserDismissal =
            errorCode === nativeGoogleSigninStatusCodes.SIGN_IN_CANCELLED ||
            /cancel/i.test(message);
          const shouldFallbackToBrowserOAuth =
            !isDeveloperConfigurationError &&
            (
              errorCode === nativeGoogleSigninStatusCodes.PLAY_SERVICES_NOT_AVAILABLE ||
              errorCode === nativeGoogleSigninStatusCodes.NULL_PRESENTER ||
              errorCode === 'GOOGLE_SIGN_IN_UNAVAILABLE' ||
              errorCode === 'NULL_PRESENTER' ||
              /Native Google Sign-In is unavailable|RNGoogleSignin|apiClient is null|Current activity is null|not exported|not linked|could not be found/i.test(message)
            );

          console.warn('[useAuth] Native Google auth SDK flow failed:', {
            code: errorCode || 'UNKNOWN',
            name,
            message,
            fallbackToBrowserOAuth: shouldFallbackToBrowserOAuth,
            developerConfigurationError: isDeveloperConfigurationError,
            userDismissal: isUserDismissal,
          });

          if (isUserDismissal || (nativeInProgressCode && errorCode === nativeInProgressCode)) {
            return { pending: false };
          }
          if (isDeveloperConfigurationError) {
            return {
              error: 'Google sign-in is not configured for this app build. Please install the signed release build or use another sign-in method.',
            };
          }
          if (shouldFallbackToBrowserOAuth) {
            console.warn('[useAuth] Native Google Sign-In unavailable, falling back to browser OAuth:', {
              code: errorCode,
              message,
            });
            // fall through to provider-specific OAuth flow below
          } else if (errorCode === 'GOOGLE_ID_TOKEN_MISSING') {
            return {
              error: 'Google sign-in completed, but the device did not return a usable ID token. Please try again.',
            };
          } else {
            return {
              error: getAuthErrorMessage(
                err,
                'Native Google sign-in failed after account selection. Please try again.'
              ),
            };
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
        const providerName = authService.getProviderName();
        const resolveRestoredSupabaseSession = async (reason: string) => {
          try {
            const { data, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) {
              console.warn('[useAuth] Native Google browser OAuth session check failed:', {
                reason,
                message: sessionError.message,
              });
              return null;
            }

            const restoredSession = mapSupabaseSessionToAuthSession(data?.session);
            if (!restoredSession) {
              return null;
            }

            console.warn('[useAuth] Native Google browser OAuth recovered an existing Supabase session:', {
              reason,
            });
            sessionBootstrapPromise = Promise.resolve(restoredSession);
            markRecentAuthSuccess();
            applyAuthenticatedSession(restoredSession);
            return { user: restoredSession.user, session: restoredSession };
          } catch (sessionError: any) {
            console.warn('[useAuth] Native Google browser OAuth session recovery threw:', {
              reason,
              message: sessionError?.message || String(sessionError),
            });
            return null;
          }
        };

        const browserResult = await openNativeOAuthBrowserSession(result.oauthUrl, callbackUrl);

        if (browserResult.type === 'error') {
          const restoredResult = await resolveRestoredSupabaseSession('browser_error');
          if (restoredResult) {
            return restoredResult;
          }

          throw browserResult.error instanceof Error
            ? browserResult.error
            : new Error('Google sign-in failed while opening the browser auth session.');
        }

        if (browserResult.type !== 'success') {
          console.warn('[useAuth] Native Google browser OAuth did not return a success callback; checking session.', {
            type: browserResult.type,
          });
          const restoredResult = await resolveRestoredSupabaseSession('browser_dismissed');
          if (restoredResult) {
            return restoredResult;
          }

          throw new Error('Google sign-in was cancelled before the browser returned to the app.');
        }

        if (!browserResult.url) {
          const restoredResult = await resolveRestoredSupabaseSession('missing_callback_url');
          if (restoredResult) {
            return restoredResult;
          }

          throw new Error('Google sign-in completed, but the app did not receive a callback URL.');
        }

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
        let sessionResult: Awaited<ReturnType<typeof createSessionFromUrl>>;
        try {
          sessionResult = await createSessionFromUrl(browserResult.url);
        } catch (sessionError: any) {
          const restoredResult = await resolveRestoredSupabaseSession('callback_parse_exception');
          if (restoredResult) {
            return restoredResult;
          }

          throw sessionError;
        }

        if (sessionResult.error) {
          const restoredResult = await resolveRestoredSupabaseSession('callback_parse_error');
          if (restoredResult) {
            return restoredResult;
          }

          throw sessionResult.error;
        }

        if (!sessionResult.session) {
          const restoredResult = await resolveRestoredSupabaseSession('missing_session_after_callback');
          if (restoredResult) {
            return restoredResult;
          }

          throw new Error('Google sign-in completed, but no Supabase session was created.');
        }

        const hydratedNativeBrowserSession =
          sessionResult.session && sessionResult.user && !(sessionResult.session as any).user
            ? { ...sessionResult.session, user: sessionResult.user }
            : sessionResult.session;
        const supabaseSession = mapSupabaseSessionToAuthSession(hydratedNativeBrowserSession);
        if (!supabaseSession) {
          const restoredResult = await resolveRestoredSupabaseSession('missing_user_after_callback');
          if (restoredResult) {
            return restoredResult;
          }

          throw new Error('Google sign-in completed, but no Supabase user session was created.');
        }

        sessionBootstrapPromise = Promise.resolve(supabaseSession);
        markRecentAuthSuccess();
        applyAuthenticatedSession(supabaseSession);
        return { user: supabaseSession.user, session: supabaseSession };
      }

      if (Platform.OS !== 'web' && !result.oauthUrl) {
        throw new Error('Google sign-in could not start. Check the OAuth configuration.');
      }

      return result;
    } catch (error) {
      throw error;
    }
  }, [applyAuthenticatedSession]);

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
