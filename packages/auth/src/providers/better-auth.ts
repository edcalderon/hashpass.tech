/**
 * Better Auth provider implementation for cookie-backed social login.
 */

import { createAuthClient } from 'better-auth/client';
import { ENV_CONFIG } from '@hashpass/config';
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

const DEFAULT_BASE_PATH = '/api/auth';
const LEGACY_BETTER_AUTH_SEGMENT = ['bsl', 'auth'].join('-');

const normalizeBasePath = (value?: string | null): string => {
  const trimmed = (value || DEFAULT_BASE_PATH).trim();
  if (!trimmed) return DEFAULT_BASE_PATH;
  const normalized = trimmed.startsWith('/') ? trimmed.replace(/\/$/, '') : `/${trimmed.replace(/\/$/, '')}`;
  return normalized.replace(new RegExp(`/${LEGACY_BETTER_AUTH_SEGMENT}$`), '/auth');
};

const normalizeBaseURL = (value?: string | null): string | undefined => {
  const trimmed = (value || '').trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\/$/, '').replace(new RegExp(`/${LEGACY_BETTER_AUTH_SEGMENT}$`), '/auth');
};

const splitName = (name?: string | null) => {
  const trimmed = (name || '').trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const [firstName, ...rest] = trimmed.split(/\s+/);
  return { firstName, lastName: rest.join(' ') };
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
      this.client = createAuthClient({
        baseURL,
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

      const session = await this.getSession({ force: true });
      if (!session) {
        return { error: 'Authentication completed but no Better Auth session was found.' };
      }

      return { user: session.user, session };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'OAuth sign-in failed' };
    }
  }

  async handleOAuthCallback(): Promise<AuthResponse> {
    const session = await this.getSession({ force: true });

    if (!session) {
      return { error: 'Authentication completed but no Better Auth session was found.' };
    }

    return { user: session.user, session };
  }

  async signOut(): Promise<{ error?: string }> {
    try {
      const result = await (this.getClient() as any).signOut();
      this.currentSession = null;
      this.notifyStateChange(null);

      if (result?.error) {
        return { error: result.error.message || 'Sign out failed' };
      }

      return {};
    } catch (error) {
      this.currentSession = null;
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
        this.notifyStateChange(session);

        return session;
      } catch (error) {
        console.error('Better Auth getSession error:', error);
        this.currentSession = null;
        this.notifyStateChange(null);
        return null;
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
