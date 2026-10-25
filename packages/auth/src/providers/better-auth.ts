/**
 * Better Auth provider implementation for cookie-backed social login.
 */

import { createAuthClient } from 'better-auth/client';
import { expoClient, getSetCookie, storageAdapter } from '@better-auth/expo/client';
import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { ENV_CONFIG } from '@hashpass/config';
import { Platform } from 'react-native';
import type {
  AuthProvider,
  AuthResponse,
  AuthSession,
  AuthStateChangeCallback,
  AuthUser,
  IAuthProvider,
} from '../types';
import { resolveWebOrigin } from '../supabase-oauth';

type BetterAuthClient = ReturnType<typeof createAuthClient>;
type SecureStoreModule = typeof import('expo-secure-store');

const DEFAULT_BASE_PATH = '/api/auth';
// Keep Better Auth requests bounded below the web bootstrap guard in
// apps/mobile-app/hooks/useAuth.ts. Without a client-side timeout, a stalled
// session refresh leaves getSession() pending until the outer guard expires,
// which presents as a bootstrap timeout even though the API is reachable.
const BETTER_AUTH_REQUEST_TIMEOUT_MS = 7000;
const LEGACY_BETTER_AUTH_SEGMENT = ['bsl', 'auth'].join('-');
const BETTER_AUTH_SESSION_CACHE_KEY = 'hashpass_better_auth_session';
/** better-fetch's abortTimeout surfaces as DOMException "The operation was aborted" (web)
 * or an Error named AbortError; both mean the request timed out or was cancelled. */
const isAbortLikeError = (error: unknown): boolean =>
  error instanceof Error && (
    error.name === 'AbortError' || error.name === 'TimeoutError' || /aborted|timed?\s?out/i.test(error.message)
  );
const PASSWORDLESS_CALLBACK_MARKER = 'supabase_passwordless_in_progress';
// expoClient's default storage keys: `${storagePrefix}_cookie`, and the OAuth
// state cookie it plants is `${cookiePrefix}.oauth_state` (optionally __Secure-).
const EXPO_COOKIE_STORAGE_KEY = 'better-auth_cookie';
const NATIVE_X_CALLBACK_PATH = '/dashboard/explore';
const NATIVE_X_ERROR_PATH = '/auth';

type NativeSignInOptions = {
  signal?: AbortSignal;
};

let secureStoreModule: SecureStoreModule | null = null;

const getSecureStore = (): SecureStoreModule => {
  if (!secureStoreModule) {
    // Keep native storage lazy without using import(), which Metro rewrites
    // through Expo's async-require helper in Android release bundles.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    secureStoreModule = require('expo-secure-store') as SecureStoreModule;
  }

  return secureStoreModule;
};

const readOAuthStateCookie = (cookieJson: string | null | undefined): string | null => {
  if (!cookieJson) return null;
  try {
    const jar = JSON.parse(cookieJson) as Record<string, { value?: string }>;
    return jar['__Secure-better-auth.oauth_state']?.value || jar['better-auth.oauth_state']?.value || null;
  } catch {
    return null;
  }
};

const describeOAuthError = (code: string): string =>
  code === 'access_denied' ? 'X sign-in was not approved.' : `X sign-in failed (${code}).`;

const normalizeBasePath = (value?: string | null): string => {
  const trimmed = (value || DEFAULT_BASE_PATH).trim();
  if (!trimmed) return DEFAULT_BASE_PATH;
  const normalized = trimmed.startsWith('/') ? trimmed.replace(/\/$/, '') : `/${trimmed.replace(/\/$/, '')}`;
  return normalized.replace(new RegExp(`/${LEGACY_BETTER_AUTH_SEGMENT}$`), '/auth');
};

const splitName = (name?: string | null) => {
  const trimmed = (name || '').trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const [firstName, ...rest] = trimmed.split(/\s+/);
  return { firstName, lastName: rest.join(' ') };
};

const resolveNativeTrustedOriginHeaders = (): Record<string, string> | undefined => {
  if (Platform.OS === 'web') {
    return undefined;
  }

  const origin = resolveWebOrigin({ allowLocal: false });
  return {
    Origin: origin,
    Referer: `${origin}/`,
  };
};

export class BetterAuthProvider implements IAuthProvider {
  private readonly basePath: string;
  private readonly explicitBaseURL?: string;
  private client: BetterAuthClient | null = null;
  private clientBaseURL: string | null = null;
  private currentSession: AuthSession | null = null;
  private stateChangeCallbacks: AuthStateChangeCallback[] = [];
  private sessionLookupInFlight: Promise<AuthSession | null> | null = null;
  private nativeSignInAttempt = 0;

  constructor(options: { baseURL?: string; basePath?: string } = {}) {
    this.basePath = normalizeBasePath(options.basePath);
    this.explicitBaseURL = options.baseURL?.replace(/\/$/, '');

    if (typeof window !== 'undefined') {
      this.initializeSession().catch((error) => {
        console.error('Failed to initialize Better Auth session:', error);
      });
    }
  }

  getProviderName(): AuthProvider {
    return 'better-auth';
  }

  private resolveClientBaseURL(): string {
    // Local Expo web runs its Better Auth route on the same origin as the
    // bundle. A propagated .env.local may still contain the deployed API base
    // URL for data requests; using that remote origin here makes the OAuth
    // callback set its session cookie on api-dev.hashpass.tech, while the
    // localhost callback page probes a different cookie jar and reports that
    // authentication completed without a session.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const hostname = window.location?.hostname?.toLowerCase();
      const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname?.endsWith('.local');
      if (isLocalHost && window.location?.origin) {
        return `${window.location.origin.replace(/\/$/, '')}${this.basePath}`;
      }
    }

    if (this.explicitBaseURL) return this.explicitBaseURL;

    const apiBaseUrl = ENV_CONFIG.getApiUrl();
    return `${apiBaseUrl.replace(/\/$/, '')}/auth`;
  }

  private getClient(): BetterAuthClient {
    const baseURL = this.resolveClientBaseURL();

    if (!this.client || this.clientBaseURL !== baseURL) {
      const nativeTrustedOriginHeaders = resolveNativeTrustedOriginHeaders();
      this.client = createAuthClient({
        baseURL,
        plugins: [
          oauthProviderClient(),
          ...(Platform.OS === 'web'
            ? []
            : [
                expoClient({
                  storage: getSecureStore(),
                }),
              ]),
        ],
        // Local Expo web runs on localhost while Better Auth lives on the
        // environment API origin. Explicit credentials are required for both
        // the OAuth state cookie on sign-in and the session cookie on the
        // callback session probe; the browser's default is same-origin.
        fetchOptions: {
          credentials: 'include',
          timeout: BETTER_AUTH_REQUEST_TIMEOUT_MS,
          ...(nativeTrustedOriginHeaders ? { headers: nativeTrustedOriginHeaders } : {}),
        },
      });
      this.clientBaseURL = baseURL;
    }

    return this.client;
  }

  private mapUser(user: Record<string, any>): AuthUser {
    const { firstName, lastName } = splitName(user.name);

    return {
      id: user.id || '',
      email: user.email || '',
      first_name: user.firstName || user.first_name || firstName,
      last_name: user.lastName || user.last_name || lastName,
      role: user.role || 'user',
      status: user.banned ? 'banned' : 'active',
      created_at: user.createdAt,
      updated_at: user.updatedAt,
      emailVerified: user.emailVerified,
      image: user.image,
      user_metadata: {
        name: user.name,
        image: user.image,
        provider: 'better-auth',
      },
    };
  }

  private mapSession(data: any): AuthSession | null {
    const user = data?.user;
    const session = data?.session;

    if (!user) return null;

    const expiresAt =
      session?.expiresAt instanceof Date
        ? session.expiresAt.getTime()
        : session?.expiresAt
          ? new Date(session.expiresAt).getTime()
          : undefined;

    return {
      user: this.mapUser(user),
      access_token: 'better_auth_session',
      refresh_token: undefined,
      expires_at: Number.isFinite(expiresAt) ? expiresAt : undefined,
      provider: 'better-auth',
    };
  }

  private notifyStateChange(session: AuthSession | null): void {
    for (const callback of this.stateChangeCallbacks) {
      try {
        callback(session);
      } catch (error) {
        console.error('Better Auth state change callback error:', error);
      }
    }
  }

  private isSessionExpired(session: AuthSession | null): boolean {
    if (!session?.expires_at) {
      // A cached session without an expiry cannot be trusted after the
      // server's cookie-backed session has expired or been revoked.
      return true;
    }

    return session.expires_at <= Date.now();
  }

  private async getStoredSession(): Promise<AuthSession | null> {
    if (Platform.OS === 'web') {
      return null;
    }

    try {
      const SecureStore = getSecureStore();
      const stored = await SecureStore.getItemAsync(BETTER_AUTH_SESSION_CACHE_KEY);
      const session = stored ? JSON.parse(stored) as AuthSession : null;

      if (!session?.user) {
        return null;
      }

      if (this.isSessionExpired(session)) {
        await SecureStore.deleteItemAsync(BETTER_AUTH_SESSION_CACHE_KEY);
        return null;
      }

      return session;
    } catch (error) {
      console.error('Error getting stored Better Auth session:', error);
      return null;
    }
  }

  private async storeSession(session: AuthSession | null): Promise<void> {
    if (Platform.OS === 'web') {
      return;
    }

    try {
      const SecureStore = getSecureStore();
      if (!session?.user || this.isSessionExpired(session)) {
        await SecureStore.deleteItemAsync(BETTER_AUTH_SESSION_CACHE_KEY);
        return;
      }

      await SecureStore.setItemAsync(BETTER_AUTH_SESSION_CACHE_KEY, JSON.stringify(session));
    } catch (error) {
      console.error('Error storing Better Auth session:', error);
    }
  }

  private async clearStoredSession(): Promise<void> {
    if (Platform.OS === 'web') {
      return;
    }

    try {
      const SecureStore = getSecureStore();
      await SecureStore.deleteItemAsync(BETTER_AUTH_SESSION_CACHE_KEY);
    } catch (error) {
      console.error('Error clearing Better Auth session:', error);
    }
  }

  private async readSessionWithRetry(
    options: { retries?: number; delayMs?: number } = {}
  ): Promise<AuthSession | null> {
    // The social callback writes its cookie on the API origin before it sends
    // the browser back to the web app. Allow for a short cross-origin cookie
    // propagation window instead of failing after a single 700ms retry.
    const retries = Math.max(0, options.retries ?? 3);
    const delayMs = Math.max(0, options.delayMs ?? 700);

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const session = await this.getSession({ force: true });
      if (session) {
        return session;
      }

      if (attempt < retries && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return null;
  }

  private async initializeSession(): Promise<void> {
    const session = await this.getSession();
    if (session) this.notifyStateChange(session);
  }

  async signInWithEmailAndPassword(_email: string, _password: string): Promise<AuthResponse> {
    return {
      error: 'Email/password sign-in is not enabled for this Better Auth flow. Use Google social sign-in.',
    };
  }

  async signInWithOAuth(provider: 'google' | 'apple' | 'github' | 'facebook' | 'twitter'): Promise<AuthResponse> {
    if (provider !== 'google' && provider !== 'apple' && provider !== 'twitter') {
      return { error: `${provider} social sign-in is not configured for this Better Auth flow.` };
    }

    // Native Google/Apple exchange an SDK ID token (signInWithIdToken). X has
    // no ID-token SDK, so native X runs the OAuth redirect inside the system
    // auth session instead.
    if (Platform.OS !== 'web') {
      return provider === 'twitter'
        ? this.signInWithNativeBrowserSession(provider)
        : { error: `${provider} native sign-in uses the platform SDK, not a browser redirect.` };
    }

    if (typeof window === 'undefined') {
      return { error: 'OAuth authentication is only available in web browsers.' };
    }

    try {
      this.currentSession = null;
      this.notifyStateChange(null);

      const storedReturnTo = window.localStorage?.getItem('oauth_return_url') || '/dashboard/explore';
      const returnTo = storedReturnTo.replace(/\/\([^/]+\)/g, '') || '/dashboard/explore';
      const frontendOrigin = resolveWebOrigin();
      // The production web app is served from S3/CloudFront. Its directory
      // redirect from `/auth/callback` to `/auth/callback/` drops the query
      // string, which removes OAuth state/return parameters before Expo Router
      // can process the callback. Use the canonical slash forms directly.
      const callbackURL = `${frontendOrigin}/auth/callback/?returnTo=${encodeURIComponent(returnTo)}`;
      const providerLabel = provider === 'apple' ? 'Apple' : provider === 'twitter' ? 'X' : 'Google';
      // Better Auth appends the provider's `error` and `error_description`
      // when it returns here. Do not pre-populate those parameters: duplicate
      // generic values hide the actual local configuration or consent error.
      const errorCallbackURL = `${frontendOrigin}/auth/`;

      window.localStorage.setItem('oauth_return_url', window.location.pathname);
      window.localStorage.removeItem(PASSWORDLESS_CALLBACK_MARKER);
      window.localStorage.setItem('oauth_in_progress', 'true');
      window.localStorage.setItem('auth_signin_method', `${provider}_oauth`);

      // Ask Better Auth for the provider URL instead of letting the client
      // choose its own browsing-context navigation. Installed WebKit and
      // WebKit-like PWAs can promote an automatic cross-origin redirect into
      // a separate browser window, which loses the handoff back to the app.
      // An explicit same-window replace keeps the OAuth journey attached to
      // the window that started it (and never uses window.open).
      const result = await (this.getClient() as any).signIn.social({
        provider,
        callbackURL,
        errorCallbackURL,
        newUserCallbackURL: callbackURL,
        disableRedirect: true,
      });

      if (result?.error) {
        return { error: result.error.message || result.error.statusText || `${providerLabel} sign-in failed.` };
      }

      const authorizationUrl = result?.data?.url;
      if (typeof authorizationUrl !== 'string' || authorizationUrl.length === 0) {
        return { error: `${providerLabel} sign-in did not return an authorization URL.` };
      }

      window.location.replace(authorizationUrl);

      return { pending: true };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'OAuth sign-in failed' };
    }
  }

  /**
   * Native browser-session sign-in (X). Better Auth's Expo client would open
   * the system auth session itself, but it discards the returned URL, so a
   * provider denial is indistinguishable from the user closing the sheet. This
   * runs the same steps with the result in hand:
   *
   *   1. `signIn.social` with `disableRedirect` -> authorization URL, and the
   *      OAuth state cookie lands in the Expo cookie jar.
   *   2. Open `expo-authorization-proxy` in ASWebAuthenticationSession (iOS) /
   *      a Custom Tab (Android); it plants that state cookie in the browser.
   *   3. The callback returns to `hashpass://...` with either `cookie=` (the
   *      session) or `error=`; a dismissed sheet returns neither.
   *
   * The X app itself is deliberately not used: the state cookie lives in this
   * browser context, so a callback delivered elsewhere would fail the state
   * check.
   */
  private async signInWithNativeBrowserSession(provider: 'twitter'): Promise<AuthResponse> {
    try {
      this.currentSession = null;
      this.notifyStateChange(null);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Linking = require('expo-linking') as typeof import('expo-linking');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const WebBrowser = require('expo-web-browser') as typeof import('expo-web-browser');

      const callbackURL = Linking.createURL(NATIVE_X_CALLBACK_PATH);
      const errorCallbackURL = Linking.createURL(NATIVE_X_ERROR_PATH);
      const cookieStore = storageAdapter(getSecureStore() as any);

      const result = await (this.getClient() as any).signIn.social({
        provider,
        callbackURL,
        newUserCallbackURL: callbackURL,
        errorCallbackURL,
        disableRedirect: true,
      });

      if (result?.error) {
        return { error: result.error.message || result.error.statusText || 'X sign-in failed.' };
      }

      const authorizationUrl = result?.data?.url;
      if (typeof authorizationUrl !== 'string' || authorizationUrl.length === 0) {
        return { error: 'X sign-in did not return an authorization URL.' };
      }

      const params = new URLSearchParams({ authorizationURL: authorizationUrl });
      const oauthState = readOAuthStateCookie(await cookieStore.getItemAsync(EXPO_COOKIE_STORAGE_KEY));
      if (oauthState) params.append('oauthState', oauthState);

      if (Platform.OS === 'android') {
        try {
          WebBrowser.dismissAuthSession();
        } catch {
          // No auth session to dismiss.
        }
      }

      const proxyURL = `${this.resolveClientBaseURL()}/expo-authorization-proxy?${params.toString()}`;
      const browserResult = await WebBrowser.openAuthSessionAsync(proxyURL, callbackURL);
      if (browserResult.type !== 'success') {
        return { cancelled: true };
      }

      const returned = new URL(browserResult.url);
      const providerError = returned.searchParams.get('error');
      if (providerError) {
        const description = returned.searchParams.get('error_description');
        return { error: description || describeOAuthError(providerError) };
      }

      const cookie = returned.searchParams.get('cookie');
      if (!cookie) {
        return { error: 'X sign-in finished without a session. Please try again.' };
      }
      const previous = await cookieStore.getItemAsync(EXPO_COOKIE_STORAGE_KEY);
      await cookieStore.setItemAsync(EXPO_COOKIE_STORAGE_KEY, getSetCookie(cookie, previous ?? undefined));

      const session = await this.readSessionWithRetry({ retries: 2, delayMs: 400 });
      if (!session) {
        return { error: 'X sign-in completed, but no session was found. Please try again.' };
      }

      this.currentSession = session;
      this.notifyStateChange(session);
      return { user: session.user, session };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'X sign-in failed' };
    }
  }

  /**
   * Native sign-in: exchange an ID token obtained by a native SDK (e.g.
   * @react-native-google-signin/google-signin) directly, with no browser
   * redirect. Better Auth verifies the token's signature/audience against
   * its configured provider client ID — see
   * https://www.better-auth.com/docs/concepts/oauth#sign-in-with-id-token
   */
  async signInWithIdToken(
    provider: 'google' | 'apple',
    idToken: string,
    options: NativeSignInOptions = {},
  ): Promise<AuthResponse> {
    const attempt = ++this.nativeSignInAttempt;
    const assertActive = () => {
      if (options.signal?.aborted || attempt !== this.nativeSignInAttempt) {
        const error = new Error('Native sign-in attempt was cancelled.');
        error.name = 'AbortError';
        throw error;
      }
    };

    try {
      assertActive();
      this.currentSession = null;
      this.notifyStateChange(null);

      const signInOptions: Record<string, any> = {
        provider,
        idToken: { token: idToken },
      };
      if (options.signal) {
        signInOptions.fetchOptions = { signal: options.signal };
      }

      const result = await (this.getClient() as any).signIn.social(signInOptions);
      assertActive();

      if (result?.error) {
        const providerLabel = provider === 'apple' ? 'Apple' : 'Google';
        return { error: result.error.message || result.error.statusText || `${providerLabel} sign-in failed.` };
      }

      // Better Auth returns the native ID-token session directly. Native
      // fetch does not retain Set-Cookie headers unless the Expo client
      // plugin is installed, so reading /get-session here can otherwise
      // report a false logout immediately after Apple/Google succeeds.
      const nativeSessionData = result?.data;
      if (nativeSessionData?.token && nativeSessionData?.user) {
        const session: AuthSession = {
          user: this.mapUser(nativeSessionData.user),
          access_token: nativeSessionData.token,
          provider: 'better-auth',
        };

        // The native ID-token response has no server expiry. Keep this
        // response in memory only; the Expo client persists the Better Auth
        // cookie, and a later getSession() stores a cache entry only when the
        // server supplies expiresAt. This prevents an incomplete response
        // from becoming an unbounded offline login.
        this.currentSession = session;
        this.notifyStateChange(session);
        return { user: session.user, session };
      }

      const session = await this.readSessionWithRetry();
      assertActive();
      if (!session) {
        return { error: 'Authentication completed but no Better Auth session was found.' };
      }

      return { user: session.user, session };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'OAuth sign-in failed' };
    }
  }

  async handleOAuthCallback(): Promise<AuthResponse> {
    const session = await this.readSessionWithRetry();

    if (!session) {
      return { error: 'Authentication completed but no Better Auth session was found.' };
    }

    return { user: session.user, session };
  }

  /**
   * Gets a Supabase session bridge for the current Better Auth session. The
   * server issues and consumes the one-time link with its service-role client;
   * this browser/native client only receives the resulting session tokens.
   * Uses Better Auth's $fetch so the request carries the same cookie/native
   * headers as getSession and social sign-in.
   */
  async fetchSupabaseBridgeSession(): Promise<{ access_token: string; refresh_token: string } | null> {
    try {
      const client = this.getClient() as any;
      const result = await client.$fetch('/supabase-bridge', { method: 'POST' });

      if (result?.error) {
        return null;
      }

      const data = result?.data?.session;
      if (!data?.access_token || !data?.refresh_token) {
        return null;
      }

      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      };
    } catch (error) {
      // The bridge is a best-effort companion to the already valid Better
      // Auth session. A timeout/abort is expected while the API is waking up
      // and must not surface as an alarming browser console error.
      return null;
    }
  }

  async signOut(): Promise<{ error?: string }> {
    // Clear the LOCAL session — in-memory and the persistent SecureStore cache —
    // BEFORE the network sign-out, not after. The Better Auth client's
    // signOut() network call has no timeout of its own and this app has a long,
    // documented history of that native transport hanging (see the
    // v1.8.234-239 auth crash investigation). If the cache clear only ran after
    // `await`ing that call, a hung request would leave the cached session on
    // disk, and the next cold-start getSession() would resurrect the user who
    // just tapped Logout — the exact "logout doesn't actually clear the
    // session" symptom on native. Clearing up front guarantees the local
    // session is gone regardless of whether the remote call ever settles.
    this.nativeSignInAttempt += 1;
    this.currentSession = null;
    await this.clearStoredSession();
    this.notifyStateChange(null);

    try {
      const result = await (this.getClient() as any).signOut();
      if (result?.error) {
        return { error: result.error.message || 'Sign out failed' };
      }

      return {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Sign out failed' };
    }
  }

  async getSession(options: { force?: boolean } = {}): Promise<AuthSession | null> {
    if (this.currentSession && !options.force) {
      return this.currentSession;
    }

    if (this.sessionLookupInFlight) {
      return this.sessionLookupInFlight;
    }

    this.sessionLookupInFlight = (async () => {
      const lookup = () => (this.getClient() as any).getSession();
      try {
        let result;
        try {
          result = await lookup();
        } catch (error) {
          // better-fetch aborts the request at fetchOptions.timeout with a
          // DOMException ("The operation was aborted"). That is a slow or
          // cold backend (dev server first hit), not an auth verdict: retry
          // once before treating it like any other transport failure.
          if (!isAbortLikeError(error)) throw error;
          await new Promise(resolve => setTimeout(resolve, 750));
          result = await lookup();
        }
        const session = this.mapSession(result?.data);

        this.currentSession = session;
        await this.storeSession(session);
        this.notifyStateChange(session);

        return session;
      } catch (error) {
        if (isAbortLikeError(error)) {
          // A timeout after the retry above is a transport state (slow backend),
          // not a bug: no error-level noise for it, same fallback as offline.
          // A timeout is an expected transient state while the API wakes up
          // or the browser resumes. Keep the cached session and stay quiet;
          // callers already have their own user-facing retry state.
        } else {
          console.error('Better Auth getSession error:', error);
        }
        // Transport-level failure (offline, DNS, flaky mobile data): keep the
        // last-known session instead of broadcasting a logout. Only a
        // successful response without a user (mapSession → null above) is a
        // definitive "signed out". Clearing state here made every native
        // connectivity blip eject a signed-in user from the dashboard, and
        // the forced dashboard→auth unmount is the window where Fabric
        // crashes natively on Android.
        if (this.currentSession) {
          return this.currentSession;
        }

        const storedSession = await this.getStoredSession();
        if (storedSession) {
          this.currentSession = storedSession;
          this.notifyStateChange(storedSession);
        }

        return storedSession;
      } finally {
        this.sessionLookupInFlight = null;
      }
    })();

    return this.sessionLookupInFlight;
  }

  async refreshSession(): Promise<AuthResponse> {
    const session = await this.getSession({ force: true });
    if (!session) return { error: 'No active Better Auth session' };
    return { user: session.user, session };
  }

  isAuthenticated(): boolean {
    return this.currentSession !== null;
  }

  getUser(): AuthUser | null {
    return this.currentSession?.user || null;
  }

  onAuthStateChange(callback: AuthStateChangeCallback): () => void {
    this.stateChangeCallbacks.push(callback);
    callback(this.currentSession);

    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }
}
