import { useCallback, useEffect, useState, useRef, useSyncExternalStore } from 'react';
import { authService, BetterAuthProvider, getSupabaseOAuthRedirectUrl } from '@hashpass/auth';
import type { AuthSession, AuthUser, IAuthProvider } from '@hashpass/auth';
import { configureAuthService } from '@hashpass/auth/auth-dependencies';
import { createSessionFromUrl, supabase, clearPersistedSupabaseSession } from '../lib/supabase';
import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import {
  clearNativeGoogleAccount,
  nativeGoogleSigninStatusCodes,
  signInWithNativeGoogleAccount,
} from '../lib/native-google-signin';
import { shouldUseNativeGoogleSignin } from '../lib/native-google-signin-config';
import { mergeOAuthFragmentParams } from '../lib/auth/oauth/callback-params';
import { clearPersistedNativeProviderSessions } from '../lib/auth/native-session-clear';
import { resolveGoogleOAuthClientId } from '../lib/auth/oauth/google-credentials';
import { resolvePublicSupabaseConfig } from '../config/supabase-profiles';
import { markRecentAuthSuccess, clearRecentAuthSuccess } from '../lib/auth/recent-auth';
import { withTimeout } from '../lib/with-timeout';
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
// `useAuth()` is intentionally used by several independent app surfaces.
// Unlike Directus and Supabase, Better Auth only dedupes an *in-flight*
// getSession() request. A transport failure settles quickly, so a remounted
// header/drawer could otherwise begin another request immediately and create
// an auth-update/remount loop. Keep the first bootstrap result for the active
// provider for this JS session; real sign-in/sign-out state changes replace it.
let betterAuthBootstrapPromise: Promise<AuthSession | null> | null = null;
let betterAuthBootstrapProvider: IAuthProvider | null = null;
let betterAuthBootstrapSettled = false;
let oauthHashProcessingPromise: Promise<void> | null = null;
let oauthHashProcessed = false;
// A dashboard logout and the next auth screen mount are separate hook
// instances. Keep this native SDK cleanup barrier at module scope so a new
// Google sign-in cannot race the preceding native Google sign-out.
let nativeGoogleSignOutCleanup: Promise<void> | null = null;

// Per-step ceiling for each network/native call inside signOut(). None of
// those calls (Google Sign-In's native module, Better Auth's client,
// Supabase's client) apply a timeout of their own, so without this a single
// hung request leaves signOut() — and any UI awaiting it, like a logout
// button's busy state — stuck forever instead of failing visibly.
const SIGN_OUT_STEP_TIMEOUT_MS = 8000;

// Better Auth's web session lookup is an HTTP request. It is the first step
// of the web auth bootstrap, so a request that never settles would otherwise
// prevent the legacy and Supabase fallbacks from resolving the auth state.
const BETTER_AUTH_BOOTSTRAP_TIMEOUT_MS = 8000;

type SignOutOptions = {
  /**
   * Leave slow provider/network cleanup running after durable local sign-out.
   * Native logout uses this so the app can safely leave the dashboard as soon
   * as every persisted session cache is removed.
   */
  waitForRemoteCleanup?: boolean;
};

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

const getBetterAuthBootstrapSession = (provider: IAuthProvider): Promise<AuthSession | null> => {
  if (betterAuthBootstrapProvider !== provider) {
    betterAuthBootstrapProvider = provider;
    betterAuthBootstrapPromise = null;
    betterAuthBootstrapSettled = false;
  }

  if (!betterAuthBootstrapPromise) {
    betterAuthBootstrapPromise = withTimeout(
      provider.getSession(),
      BETTER_AUTH_BOOTSTRAP_TIMEOUT_MS,
      'betterAuthProvider.getSession',
    ).finally(() => {
      betterAuthBootstrapSettled = true;
    });
  }

  return betterAuthBootstrapPromise!;
};

const cacheBetterAuthBootstrapSession = (provider: IAuthProvider, session: AuthSession | null): void => {
  // onAuthStateChange immediately calls a new subscriber with its current
  // value, commonly null. Do not let that initial callback replace the first
  // real bootstrap request; only cache a known session or an update after the
  // initial lookup has settled.
  if (!session?.user && !betterAuthBootstrapSettled) {
    return;
  }

  betterAuthBootstrapProvider = provider;
  betterAuthBootstrapPromise = Promise.resolve(session);
  betterAuthBootstrapSettled = true;
};

const setSignedOutBetterAuthBootstrap = (): void => {
  betterAuthBootstrapPromise = Promise.resolve(null);
  betterAuthBootstrapSettled = true;
};

export const completeSupabaseBridgeSession = async (
  session: { access_token: string; refresh_token: string },
) => {
  if (!session.access_token || !session.refresh_token) {
    return;
  }

  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  if (error) {
    throw error;
  }
};

// Establishes a real Supabase session alongside a just-completed Better Auth
// sign-in (web OAuth callback or native ID-token exchange). Without this,
// Better-Auth-only accounts never get a Supabase auth.users row bridged in
// time for the client to hold a matching JWT — meaning they can complete
// sign-in but can't read their own BSL general passes or hold admin roles
// (both are gated by a real Supabase auth.users id / auth.uid()). Fire this
// after sign-in succeeds; never let it block or fail the sign-in itself —
// the user is already validly signed in via Better Auth regardless of
// whether this secondary bridge succeeds.
const ensureSupabaseBridgeSession = async (betterAuthProvider: IAuthProvider): Promise<void> => {
  try {
    const provider = betterAuthProvider as unknown as BetterAuthProvider;
    if (typeof provider.fetchSupabaseBridgeSession !== 'function') {
      return;
    }

    const bridgeSession = await provider.fetchSupabaseBridgeSession();
    if (!bridgeSession) {
      return;
    }

    await completeSupabaseBridgeSession(bridgeSession);
  } catch (error) {
    console.warn(
      '[useAuth] Supabase session bridge failed (Better Auth sign-in still valid):',
      error instanceof Error ? error.message : String(error)
    );
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

// useAuth() is called independently from several unconnected places (root
// layout, dashboard layout, BalanceContext, NotificationContext, the auth
// screen, ...). Each used to get its OWN authSessionMachine actor via
// useState, meaning a signOut() dispatched from one instance's actor never
// reached any other -- e.g. the dashboard's actor would correctly flip to
// unauthenticated and navigate to /auth, but the root layout's own,
// completely separate actor still held its last-cached "logged in" result,
// so the auth screen (reading isLoggedIn from ITS OWN actor) saw a still-
// authenticated user and immediately redirected back to the dashboard --
// this is exactly why a real page reload "fixed" it (every actor re-
// bootstraps from the now-actually-cleared storage) while an in-app
// navigation did not. Sharing one module-level actor across every useAuth()
// call site fixes this: a signOut() from any consumer is immediately
// visible to all of them.
//
// This actor is a session-lifetime singleton and is intentionally never
// stopped by any one consumer unmounting: an earlier version of this fix
// reference-counted start()/stop() so the "last" remaining consumer would
// stop it, but a component holds its own `authActor` reference for its
// whole lifetime (captured once via useState's lazy initializer) -- if
// that component is ever the sole mounted consumer and unmounts+remounts
// (ordinary React remounts during the auth-redirect churn right after
// login are enough, no StrictMode needed), its cleanup drives the ref
// count to zero and stops the actor, then the remount calls .start() on
// that same already-.stop()ped actor object. XState rejects that, throwing
// synchronously inside the effect and leaving the whole dashboard tree
// crashed/unresponsive -- observed live as an uncaught "The operation was
// aborted" error right after a real login (surfaced from the sibling
// supabase.auth.onAuthStateChange effect below, consistent with this
// effect throwing earlier in the same commit and leaving the rest of the
// hook's setup in a broken state). Simplest correct fix: start the actor
// once, ever, and never stop it -- same lifetime as any other app-wide
// singleton.
let sharedAuthActor: ReturnType<typeof createAuthSessionActor> | null = null;
let sharedAuthActorStarted = false;

const getSharedAuthActor = () => {
  if (!sharedAuthActor) {
    sharedAuthActor = createAuthSessionActor();
  }
  return sharedAuthActor;
};

// supabase.auth.onAuthStateChange()/getSession() both funnel through gotrue-js's
// internal navigatorLock -- an exclusive lock (via the browser's Web Locks API)
// coordinating auth state across tabs, with a 10s default acquire timeout. Every
// separate useAuth() call site (root layout, dashboard layout,
// NotificationContext, BalanceContext, ...) used to register its OWN
// onAuthStateChange subscription and run its OWN getSession() bootstrap
// independently. Right after a fresh login, with several consumers mounted at
// once, enough concurrent Supabase auth calls piled up to genuinely exceed that
// 10s budget, surfacing as an uncaught NavigatorLockAcquireTimeoutError ("The
// operation was aborted") right after sign-in. Only one subscription/bootstrap
// call is actually needed for the whole app: every consumer already gets the
// resulting session state via the shared authActor (PROVIDER_RESOLVED events,
// dispatched through sendAuthEvent below regardless of which instance's
// closure captured the callback) -- dbUserId needed its own small shared
// broadcast since it isn't part of the actor's own state.
let supabaseAuthSubscribed = false;
let supabaseBootstrapPromise: ReturnType<typeof supabase.auth.getSession> | null = null;
// dbUserId is a module-level store rather than per-instance state, read
// through useSyncExternalStore below. That's React's purpose-built API for
// subscribing to an external mutable store, and it's what keeps a broadcast
// safe: a hand-rolled fan-out (setDbUserId on every mounted instance) can
// land mid-render of an unrelated component and trip React's "Cannot update
// a component while rendering a different component" warning, and can also
// tear (different consumers rendering different values in one pass).
let sharedDbUserId: string | null = null;
const dbUserIdListeners = new Set<() => void>();

const broadcastDbUserId = (id: string | null) => {
  if (sharedDbUserId === id) {
    return;
  }
  sharedDbUserId = id;
  dbUserIdListeners.forEach((notify) => notify());
};

const subscribeToDbUserId = (onStoreChange: () => void) => {
  dbUserIdListeners.add(onStoreChange);
  return () => {
    dbUserIdListeners.delete(onStoreChange);
  };
};

const getDbUserIdSnapshot = () => sharedDbUserId;

// A shared, app-lifetime subscription must not close over ANY per-instance
// state. The first version of this fix reused the mounting instance's
// sendProviderResolved(), which early-returns on its own `isActive` flag --
// so as soon as that first instance unmounted (e.g. the auth screen
// unmounting right after a successful login), every subsequent Supabase auth
// event was silently dropped app-wide. The machine then never received a
// `supabase` PROVIDER_RESOLVED, allProvidersReady() stayed false, and
// getAuthViewState()'s `isLoading` never flipped to false -- the dashboard
// hung on its loading state forever. These two module-level pieces keep the
// shared callback self-contained instead.
let sharedSupabaseBootstrapFinished = false;

const sendSharedAuthEvent = (event: AuthSessionMachineEvent) => {
  const actor = getSharedAuthActor();
  if (actor.getSnapshot().status === 'stopped') {
    return;
  }

  actor.send(event);
};

const sendSharedSupabaseResolved = (session: any) => {
  const mappedSession = mapSupabaseSessionToAuthSession(session);

  sendSharedAuthEvent({
    type: 'PROVIDER_RESOLVED',
    provider: 'supabase',
    session: mappedSession,
    user: mappedSession?.user ?? null,
    loggedIn: Boolean(mappedSession?.user),
  });
};

const hasSameAuthViewState = (
  current: ReturnType<typeof getAuthViewState>,
  next: ReturnType<typeof getAuthViewState>,
): boolean =>
  current.isLoggedIn === next.isLoggedIn &&
  current.isLoading === next.isLoading &&
  current.user?.id === next.user?.id &&
  current.user?.email === next.user?.email &&
  current.user?.first_name === next.user?.first_name &&
  current.user?.last_name === next.user?.last_name &&
  current.user?.role === next.user?.role &&
  current.user?.status === next.user?.status;

export const useAuth = () => {
  const [authActor] = useState(() => getSharedAuthActor());
  const [authViewState, setAuthViewState] = useState(() =>
    getAuthViewState(authActor.getSnapshot())
  );
  const authViewStateRef = useRef(authViewState);
  const { user, isLoggedIn, isLoading } = authViewState;
  // The real Supabase auth.users(id) UUID for the CURRENT Supabase client
  // session, independent of PROVIDER_PRIORITY (auth-session-machine.ts always
  // prefers betterAuth's user over supabase's when both are logged in, so
  // `user.id` above stays the Better Auth internal id even after the
  // dual-session bridge — see ensureSupabaseBridgeSession — establishes a
  // real Supabase session for that same account). Any code querying a
  // Supabase-native table directly (passes, tutorial progress, meeting
  // requests, etc.) needs THIS id, not user.id, or it 22P02s on a
  // Better-Auth-only session (its id isn't a UUID at all). Null until the
  // bridge (or a native Supabase sign-in) actually completes.
  const dbUserId = useSyncExternalStore(
    subscribeToDbUserId,
    getDbUserIdSnapshot,
    getDbUserIdSnapshot,
  );
  const isInitializedRef = useRef(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const betterAuthUnsubscribeRef = useRef<(() => void) | null>(null);
  const authenticatedSessionOverrideRef = useRef<AuthSession | null>(null);

  const sendAuthEvent = useCallback((event: AuthSessionMachineEvent) => {
    if (authActor.getSnapshot().status === 'stopped') {
      return;
    }

    authActor.send(event);
  }, [authActor]);

  const updateAuthViewState = useCallback((nextAuthViewState: ReturnType<typeof getAuthViewState>) => {
    // Do this before calling the React setter. Returning the existing value
    // from a functional state updater can still schedule a render in React,
    // which is enough for duplicate provider callbacks to re-enter nested
    // auth-consuming dashboard UI.
    if (hasSameAuthViewState(authViewStateRef.current, nextAuthViewState)) {
      return;
    }

    authViewStateRef.current = nextAuthViewState;
    setAuthViewState(nextAuthViewState);
  }, []);

  useEffect(() => {
    const subscription = authActor.subscribe((snapshot: AuthSessionMachineSnapshot) => {
      updateAuthViewState(getAuthViewState(snapshot));
    });

    if (!sharedAuthActorStarted) {
      authActor.start();
      sharedAuthActorStarted = true;
    }
    updateAuthViewState(getAuthViewState(authActor.getSnapshot()));

    return () => {
      subscription.unsubscribe();
      // Deliberately does not stop the shared actor -- see the comment above
      // getSharedAuthActor().
    };
  }, [authActor, updateAuthViewState]);

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
      const supabaseBridgeAccessToken = hashParams.get('sb_access_token');
      const supabaseBridgeRefreshToken = hashParams.get('sb_refresh_token');
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

            if (supabaseBridgeAccessToken && supabaseBridgeRefreshToken) {
              try {
                await completeSupabaseBridgeSession(
                  {
                    access_token: supabaseBridgeAccessToken,
                    refresh_token: supabaseBridgeRefreshToken,
                  },
                );
              } catch (bridgeError: any) {
                console.warn(
                  '[useAuth] ⚠️ Supabase dual-session bridge failed:',
                  bridgeError?.message || String(bridgeError)
                );
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
        cacheBetterAuthBootstrapSession(betterAuthProvider, session);
        const betterAuthState = readAuthSessionState(session);

        // Ignore the initial null callback until bootstrap resolves to avoid
        // false "logged out" redirects during the first Better Auth probe.
        if (!betterAuthBootstrapFinished && !betterAuthState.loggedIn) {
          return;
        }

        sendProviderResolved('betterAuth', betterAuthState);
      });
    }

    // Subscribe to Supabase state changes (needed for passwordless and
    // dual-session bridge) -- only once globally, ever, and deliberately
    // never unsubscribed (same reasoning as the shared authActor: whichever
    // instance happens to unmount first must not tear this down while other
    // mounted consumers still rely on it).
    //
    // Everything this callback touches is module-level ON PURPOSE -- see the
    // comment above sendSharedSupabaseResolved. It must not use this effect's
    // sendProviderResolved/supabaseBootstrapFinished, both of which belong to
    // whichever instance happened to mount first and go stale (permanently
    // silencing Supabase auth events, hanging the dashboard on its loading
    // state) the moment that instance unmounts.
    if (!supabaseAuthSubscribed) {
      supabaseAuthSubscribed = true;
      supabase.auth.onAuthStateChange((_event: string, session: any) => {
        broadcastDbUserId(session?.user?.id ?? null);
        // Ignore initial null callback until bootstrap resolves to avoid false "logged out" redirects.
        if (!sharedSupabaseBootstrapFinished && !session?.user) {
          return;
        }

        sendSharedSupabaseResolved(session);
      });
    }

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

      // Deduped the same way sessionBootstrapPromise dedupes authService.getSession()
      // above: multiple mounted instances all reach this line, but the actual
      // getSession() call (and its navigatorLock acquisition) only happens once.
      (supabaseBootstrapPromise ?? (supabaseBootstrapPromise = supabase.auth.getSession()))
        .then(({ data }: any) => {
          supabaseBootstrapFinished = true;
          sharedSupabaseBootstrapFinished = true;
          broadcastDbUserId(data?.session?.user?.id ?? null);
          sendProviderResolved('supabase', readSupabaseStateFromSession(data.session));
        })
        .catch((error: any) => {
          console.error('[useAuth] Supabase session bootstrap failed:', error);
          supabaseBootstrapFinished = true;
          sharedSupabaseBootstrapFinished = true;
          sendProviderResolved('supabase', readAuthSessionState(null));
        });
    };

    if (betterAuthProvider) {
      let latestBetterAuthState = readAuthSessionState(null);

      getBetterAuthBootstrapSession(betterAuthProvider)
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
            // (supabase.auth.getSession() reads local storage — no network,
            // but still goes through the same navigatorLock as every other
            // GoTrueClient call, hence the same shared-promise dedup.)
            (supabaseBootstrapPromise ?? (supabaseBootstrapPromise = supabase.auth.getSession()))
              .then(({ data }: any) => {
                supabaseBootstrapFinished = true;
                sharedSupabaseBootstrapFinished = true;
                broadcastDbUserId(data?.session?.user?.id ?? null);
                sendProviderResolved('supabase', readSupabaseStateFromSession(data.session));
              })
              .catch(() => {
                supabaseBootstrapFinished = true;
                sharedSupabaseBootstrapFinished = true;
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
      // No supabaseUnsubscribeRef cleanup here anymore -- the Supabase
      // subscription above is a shared, session-lifetime singleton (see
      // supabaseAuthSubscribed), not owned by this instance.
      if (betterAuthUnsubscribeRef.current) {
        betterAuthUnsubscribeRef.current();
        betterAuthUnsubscribeRef.current = null;
      }
      isInitializedRef.current = false;
    };
  }, [sendAuthEvent]);

  const signOut = useCallback(async ({ waitForRemoteCleanup = true }: SignOutOptions = {}) => {
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

    // Clear LOCAL session state up front, before any remote provider cleanup.
    // The remote sign-outs below are individually bounded but can still take up
    // to the full per-step timeout ceiling (up to ~16s worst case across the
    // sequential native-Google clear + the parallel provider batch) on this
    // app's documented flaky native transport. Gating "the user is actually
    // logged out" on those calls is what made Logout appear to hang: the caller
    // (see handleLogout in dashboard/_layout.tsx) awaited this whole function
    // before navigating, so its spinner spun for the entire timeout window.
    // Emitting SIGNED_OUT here — synchronously, before the first `await` below —
    // flips isLoggedIn to false immediately so the UI can redirect at once,
    // while the provider cleanup still runs (and is still awaited by callers/
    // tests that want to observe it) as best-effort background work.
    sessionBootstrapPromise = Promise.resolve(null);
    setSignedOutBetterAuthBootstrap();
    // supabaseBootstrapPromise is memoized module-level (deduped across every
    // mounted useAuth() instance, same reasoning as sessionBootstrapPromise
    // above) but was never reset here. A fresh useAuth() mount on the /auth
    // screen we're about to navigate to replays this already-settled promise
    // in startLegacyBootstrap(), which still resolves the pre-logout signed-in
    // session (supabase.auth.signOut()'s network call is still running in the
    // background for waitForRemoteCleanup: false callers) and re-authenticates
    // the just-cleared session, bouncing the redirect straight back to the
    // dashboard. Resetting it to an already-resolved "no session" value here
    // closes that race the same way the other two bootstrap caches are closed.
    supabaseBootstrapPromise = Promise.resolve({ data: { session: null }, error: null } as any);
    sendAuthEvent({ type: 'SIGNED_OUT' });
    // Clear synchronously alongside the SIGNED_OUT event, not left to wait on
    // supabase.auth.signOut() below (best-effort, individually timed-out) —
    // otherwise a slow/failed remote call leaves the previous session's id
    // dangling as "current" after isLoggedIn has already flipped to false.
    // Clears the shared store so every mounted useAuth() consumer sees it,
    // not just whichever instance's signOut() happened to run -- same
    // reasoning as the shared authActor fix.
    broadcastDbUserId(null);

    // Persisted data must be gone before a native screen transition. In
    // particular, Better Auth and Directus use SecureStore while Supabase uses
    // AsyncStorage. Previously Better Auth's cache was only reached after
    // native Google cleanup, so replacing the route immediately could leave a
    // cache that resurrected the user after a cold start.
    const shouldSignOutNativeGoogle =
      Platform.OS !== 'web' && shouldUseNativeGoogleSignin(resolveGoogleOAuthClientId());
    const clearNativeGoogleBeforeNextLogin = async () => {
      if (!shouldSignOutNativeGoogle) {
        return;
      }

      try {
        // This is intentionally part of the local sign-out barrier. Starting
        // a new SDK signIn while the previous SDK signOut is still resolving
        // produces ASYNC_OP_IN_PROGRESS and leaves the auth screen stuck in
        // its "Opening Google sign-in" state.
        await withTimeout(clearNativeGoogleAccount(), SIGN_OUT_STEP_TIMEOUT_MS, 'clearNativeGoogleAccount');
      } catch (nativeClearError) {
        console.warn('[useAuth] Native Google account cache clear failed during sign-out:', nativeClearError);
      }
    };

    const nativeGoogleCleanupPromise = clearNativeGoogleBeforeNextLogin();
    nativeGoogleSignOutCleanup = nativeGoogleCleanupPromise;
    void nativeGoogleCleanupPromise.finally(() => {
      if (nativeGoogleSignOutCleanup === nativeGoogleCleanupPromise) {
        nativeGoogleSignOutCleanup = null;
      }
    });

    await Promise.all([
      clearPersistedNativeProviderSessions(),
      clearPersistedSupabaseSession(),
    ]);

    const finishRemoteCleanup = async () => {
      const dedicatedGoogleBetterAuthProvider =
        authService.getProviderName() !== 'better-auth' &&
        (Platform.OS === 'web' || shouldSignOutNativeGoogle)
          ? getGoogleBetterAuthProvider()
          : null;

      // Each provider call is individually bounded so one hung network request
      // cannot stall cleanup forever. Local state has already been cleared,
      // therefore a failed remote revocation must not restore the session.
      const results = await Promise.allSettled([
        withTimeout(authService.signOut(), SIGN_OUT_STEP_TIMEOUT_MS, 'authService.signOut'),
        withTimeout(
          dedicatedGoogleBetterAuthProvider?.signOut() ?? Promise.resolve(undefined),
          SIGN_OUT_STEP_TIMEOUT_MS,
          'dedicatedGoogleBetterAuthProvider.signOut',
        ),
        withTimeout(supabase.auth.signOut(), SIGN_OUT_STEP_TIMEOUT_MS, 'supabase.auth.signOut'),
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
          '[useAuth] Provider sign-out reported cleanup errors; local auth state was already cleared:',
          signOutFailures.map((failure) => getAuthErrorMessage(failure, 'Unable to sign out.'))
        );
      }
    };

    if (waitForRemoteCleanup) {
      await nativeGoogleCleanupPromise;
      await finishRemoteCleanup();
    } else {
      // Do not hold native navigation on a flaky Google SDK call. The next
      // native Google login awaits this same promise before opening its picker.
      void finishRemoteCleanup().catch((error) => {
        console.warn('[useAuth] Remote sign-out cleanup failed after local sign-out:', error);
      });
    }
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
          setSignedOutBetterAuthBootstrap();
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
          // The dashboard can unmount immediately after logout. Await the
          // module-scoped barrier from that unmounted hook before starting a
          // new native SDK operation, otherwise Google returns IN_PROGRESS.
          if (nativeGoogleSignOutCleanup) {
            await nativeGoogleSignOutCleanup;
          }
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
            // Fire-and-forget: establishes a real Supabase session so passes/
            // admin roles work for this Better-Auth-only account. Must not
            // block or fail the sign-in the user already completed.
            void ensureSupabaseBridgeSession(betterAuthGoogle);
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

          if (isUserDismissal) {
            return { pending: false };
          }
          if (nativeInProgressCode && errorCode === nativeInProgressCode) {
            return {
              error: 'Google sign-in is still finishing. Please wait a moment and try again.',
            };
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

        // Fire-and-forget: establishes a real Supabase session so passes/
        // admin roles work for this Better-Auth-only account. Must not
        // block or fail the sign-in the user already completed.
        void ensureSupabaseBridgeSession(betterAuthGoogle);

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
    // The real Supabase auth.users(id) UUID for this session, or null until
    // one exists (native Supabase sign-in, or the Better Auth dual-session
    // bridge completing). Use this — not user.id — for any direct query
    // against a Supabase-native table (passes, meeting_requests,
    // user_tutorial_progress, notifications, etc.).
    dbUserId,
  };
};
