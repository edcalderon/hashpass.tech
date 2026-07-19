/**
 * Better Auth provider implementation for cookie-backed social login.
 */

import { createAuthClient } from 'better-auth/client';
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
const LEGACY_BETTER_AUTH_SEGMENT = ['bsl', 'auth'].join('-');
const BETTER_AUTH_SESSION_CACHE_KEY = 'hashpass_better_auth_session';

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
        ...(nativeTrustedOriginHeaders
          ? {
              fetchOptions: {
                headers: nativeTrustedOriginHeaders,
              },
            }
          : {}),
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
      return false;
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
    const retries = Math.max(0, options.retries ?? 1);
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

  async signInWithOAuth(provider: 'google' | 'github' | 'facebook' | 'twitter'): Promise<AuthResponse> {
    if (typeof window === 'undefined') {
      return { error: 'OAuth authentication is only available in web browsers.' };
    }

    if (provider !== 'google') {
      return { error: `${provider} social sign-in is not configured for this Better Auth flow.` };
    }

    try {
      this.currentSession = null;
      this.notifyStateChange(null);

      const storedReturnTo = window.localStorage?.getItem('oauth_return_url') || '/dashboard/explore';
      const returnTo = storedReturnTo.replace(/\/\([^/]+\)/g, '') || '/dashboard/explore';
      const frontendOrigin = resolveWebOrigin();
      const callbackURL = `${frontendOrigin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`;
      const errorCallbackURL = `${frontendOrigin}/auth?error=oauth_failed&message=${encodeURIComponent(
        'Google sign-in failed. Please try again.'
      )}`;

      window.localStorage.setItem('oauth_return_url', window.location.pathname);
      window.localStorage.setItem('oauth_in_progress', 'true');
      window.localStorage.setItem('auth_signin_method', 'google_oauth');

      const result = await (this.getClient() as any).signIn.social({
        provider: 'google',
        callbackURL,
        errorCallbackURL,
        newUserCallbackURL: callbackURL,
      });

      if (result?.error) {
        return { error: result.error.message || result.error.statusText || 'Google sign-in failed.' };
      }

      return { pending: true };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'OAuth sign-in failed' };
    }
  }

  /**
   * Native sign-in: exchange an ID token obtained by a native SDK (e.g.
   * @react-native-google-signin/google-signin) directly, with no browser
   * redirect. Better Auth verifies the token's signature/audience against
   * its configured provider client ID — see
   * https://www.better-auth.com/docs/concepts/oauth#sign-in-with-id-token
   */
  async signInWithIdToken(provider: 'google', idToken: string): Promise<AuthResponse> {
    try {
      this.currentSession = null;
      this.notifyStateChange(null);

      const result = await (this.getClient() as any).signIn.social({
        provider,
        idToken: { token: idToken },
      });

      if (result?.error) {
        return { error: result.error.message || result.error.statusText || 'Google sign-in failed.' };
      }

      const session = await this.readSessionWithRetry();
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

  async signOut(): Promise<{ error?: string }> {
    try {
      const result = await (this.getClient() as any).signOut();
      this.currentSession = null;
      await this.clearStoredSession();
      this.notifyStateChange(null);

      if (result?.error) {
        return { error: result.error.message || 'Sign out failed' };
      }

      return {};
    } catch (error) {
      this.currentSession = null;
      await this.clearStoredSession();
      this.notifyStateChange(null);
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
      try {
        const result = await (this.getClient() as any).getSession();
        const session = this.mapSession(result?.data);

        this.currentSession = session;
        await this.storeSession(session);
        this.notifyStateChange(session);

        return session;
      } catch (error) {
        console.error('Better Auth getSession error:', error);
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
