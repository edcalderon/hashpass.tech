/**
 * Directus authentication provider implementation
 */

import type {
  IAuthProvider,
  AuthUser,
  AuthSession,
  AuthResponse,
  AuthStateChangeCallback,
  AuthProvider
} from '../types';
import { Platform } from 'react-native';
import { ENV_CONFIG } from '@hashpass/config';
import { DirectusApiClient } from './directus-api-client';
import type { DirectusApiError } from './directus-api-client';

type SecureStoreModule = typeof import('expo-secure-store');

let secureStoreModule: SecureStoreModule | null = null;

const getSecureStore = (): SecureStoreModule => {
  if (!secureStoreModule) {
    // Keep native storage lazy without using import(), which Metro rewrites
    // through Expo's async-require helper during Android release bundling.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    secureStoreModule = require('expo-secure-store') as SecureStoreModule;
  }
  return secureStoreModule;
};

export class DirectusAuthProvider implements IAuthProvider {
  private baseUrl: string;
  private apiClient: DirectusApiClient;
  private session: AuthSession | null = null;
  private stateChangeCallbacks: AuthStateChangeCallback[] = [];
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionLookupInFlight: Promise<AuthSession | null> | null = null;
  private nextSessionProbeAt = 0;

  constructor(url: string) {
    this.baseUrl = url.replace(/\/$/, '');
    this.apiClient = new DirectusApiClient(this.baseUrl);
    // Initialize session asynchronously to avoid blocking constructor
    this.initializeSession().catch(error => {
      console.error('Failed to initialize session:', error);
    });
  }

  private isCookieBackedSession(session: AuthSession | null): boolean {
    if (!session?.access_token) return false;
    return session.access_token === 'session_based' || session.access_token === 'oauth_session';
  }

  private isProfileIncomplete(session: AuthSession | null): boolean {
    const user = session?.user;
    if (!user) return true;

    const hasEmail = typeof user.email === 'string' && user.email.trim().length > 0;
    const hasName =
      (typeof user.first_name === 'string' && user.first_name.trim().length > 0) ||
      (typeof user.last_name === 'string' && user.last_name.trim().length > 0) ||
      (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim().length > 0);

    return !(hasEmail || hasName);
  }

  private mapDirectusUser(userData: Record<string, any>): AuthUser {
    const existingUser = this.session?.user ?? null;
    const pick = (...values: Array<string | undefined | null>): string | undefined => {
      for (const value of values) {
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (trimmed.length > 0) return trimmed;
        }
      }
      return undefined;
    };

    const email = pick(
      userData.email,
      userData.user_metadata?.email,
      existingUser?.email
    ) || '';

    const firstName = pick(
      userData.first_name,
      userData.user_metadata?.first_name,
      userData.user_metadata?.full_name?.split(' ')?.[0],
      existingUser?.first_name
    );

    const lastName = pick(
      userData.last_name,
      userData.user_metadata?.last_name,
      userData.user_metadata?.full_name?.split(' ')?.slice(1).join(' '),
      existingUser?.last_name
    );

    return {
      id: userData.id || existingUser?.id || '',
      email,
      first_name: firstName,
      last_name: lastName,
      avatar: userData.avatar || existingUser?.avatar,
      role: userData.role || existingUser?.role,
      status: userData.status || existingUser?.status,
      last_access: userData.last_access || existingUser?.last_access,
      created_at: userData.created_at || userData.date_created || existingUser?.created_at,
      date_created: userData.date_created || existingUser?.date_created,
      user_metadata: userData.user_metadata || existingUser?.user_metadata,
    };
  }

  private parseDirectusUserPayload(value: string | null | undefined): Record<string, any> | null {
    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }

    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }

      const candidate = parsed as Record<string, any>;
      if (candidate.data && typeof candidate.data === 'object' && !Array.isArray(candidate.data)) {
        return candidate.data as Record<string, any>;
      }

      return candidate;
    } catch {
      return null;
    }
  }

  private buildSessionFromToken(
    userData: Record<string, any>,
    accessToken: string,
    refreshToken?: string,
    expiresInSeconds?: number
  ): AuthSession {
    return {
      user: this.mapDirectusUser(userData),
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresInSeconds ? Date.now() + (expiresInSeconds * 1000) : undefined,
    };
  }

  private createPersistedSession(session: AuthSession): AuthSession {
    return {
      user: session.user,
      access_token: this.isCookieBackedSession(session) ? session.access_token : 'session_based',
      provider: session.provider,
      expires_at: session.expires_at,
    };
  }

  private pushOAuthFailure(
    failures: Array<{ stage: string; message: string; status?: number; code?: string }>,
    stage: string,
    error?: DirectusApiError | null,
    fallbackMessage?: string
  ): void {
    if (error) {
      failures.push({
        stage,
        message: error.message,
        status: error.status,
        code: error.code,
      });
      return;
    }

    if (fallbackMessage) {
      failures.push({
        stage,
        message: fallbackMessage,
      });
    }
  }

  private buildOAuthFailureMessage(
    failures: Array<{ stage: string; message: string; status?: number; code?: string }>
  ): string {
    if (failures.length === 0) {
      return 'Authentication could not be completed. No active Directus session was found after OAuth. Redirecting to login.';
    }

    const hasInvalidCredentials = failures.some(
      ({ code, status, message }) =>
        code === 'INVALID_CREDENTIALS' ||
        status === 401 ||
        /invalid user credentials/i.test(message)
    );

    if (hasInvalidCredentials) {
      return 'Authentication completed, but Directus did not establish a valid session (401 INVALID_CREDENTIALS). Please sign in again.';
    }

    const hasNetworkFailure = failures.some(({ message }) =>
      /networkerror|failed to fetch|cross-origin|cors request|cors/i.test(message)
    );

    if (hasNetworkFailure) {
      return 'Authentication could not be completed because the browser could not reach Directus. Check CORS and Directus URL settings, then try again.';
    }

    const firstFailure = failures[0];
    const statusSuffix = firstFailure.status ? ` [${firstFailure.status}]` : '';
    const codeSuffix = firstFailure.code ? ` (${firstFailure.code})` : '';

    return `Authentication could not be completed${statusSuffix}${codeSuffix}: ${firstFailure.message}. Redirecting to login.`;
  }

  private resolveOAuthApiBaseUrl(): string {
    return ENV_CONFIG.getApiUrl().replace(/\/$/, '');
  }

  private mapDirectusOAuthReason(reason: string): string {
    const normalized = reason.toUpperCase();

    switch (normalized) {
      case 'INVALID_CREDENTIALS':
        return 'Directus rejected the OAuth callback credentials from Google before creating a session. Please try signing in again.';
      case 'INVALID_PROVIDER':
      case 'INVALID_PROVIDER_CONFIG':
        return 'Google OAuth provider is not configured correctly in Directus. Please contact support.';
      case 'INVALID_TOKEN':
        return 'Google returned an invalid or expired authorization token. Please sign in again.';
      default:
        return `Directus OAuth callback failed with reason: ${reason}.`;
    }
  }

  private isRateLimited(error?: DirectusApiError | null): boolean {
    if (!error) return false;
    return error.status === 429 || error.code === 'TOO_MANY_REQUESTS';
  }

  private isInvalidCredentials(error?: DirectusApiError | null): boolean {
    if (!error) return false;
    return (
      error.code === 'INVALID_CREDENTIALS' ||
      error.status === 401 ||
      /invalid user credentials/i.test(error.message)
    );
  }

  getProviderName(): AuthProvider {
    return 'directus';
  }

  private async initializeSession(): Promise<void> {
    try {
      // Only initialize session in browser environment
      if (typeof window === 'undefined') {
        return;
      }

      const storedSession = await this.getStoredSession();
      if (storedSession) {
        if (this.isCookieBackedSession(storedSession)) {
          // Cookie-backed pseudo tokens can go stale across browser restarts.
          await this.clearStoredSession();
          return;
        }
        this.session = storedSession;
        this.setupRefreshTimer();
        this.notifyStateChange(this.session);
      }
    } catch (error) {
      console.error('Failed to initialize session:', error);
    }
  }

  async signInWithEmailAndPassword(email: string, password: string): Promise<AuthResponse> {
    try {
      const loginResult = await this.apiClient.signInWithPassword(email, password);
      if (loginResult.error || !loginResult.data?.access_token) {
        return { error: loginResult.error?.message || 'Authentication failed' };
      }

      const userResult = await this.apiClient.getCurrentUserWithToken(loginResult.data.access_token);
      if (userResult.error || !userResult.data) {
        return { error: userResult.error?.message || 'Failed to fetch user data' };
      }

      const user = this.mapDirectusUser(userResult.data);

      const session: AuthSession = {
        user,
        access_token: loginResult.data.access_token,
        refresh_token: loginResult.data.refresh_token,
        expires_at: loginResult.data.expires ? Date.now() + (loginResult.data.expires * 1000) : undefined,
        provider: 'directus'
      };

      this.session = session;
      this.setupRefreshTimer();
      this.notifyStateChange(session);

      return { user, session };
    } catch (error) {
      console.error('Sign in error:', error);
      return { error: error instanceof Error ? error.message : 'Sign in failed' };
    }
  }

  async signInWithOAuth(provider: 'google' | 'github' | 'facebook' | 'twitter'): Promise<AuthResponse> {
    try {
      if (Platform.OS === 'web') {
        // Clear local auth state before OAuth to avoid stale user sessions.
        this.session = null;
        await this.clearStoredSession();
        this.clearRefreshTimer();
        this.notifyStateChange(null);

        // Best-effort cleanup of any existing Directus cookie session.
        // Avoid custom headers so this remains a simple CORS request.
        try {
          await this.apiClient.logoutSession();
        } catch (logoutError) {
          console.debug('No existing Directus cookie session to clear before OAuth:', logoutError);
        }

        // For web, use our API base URL to start OAuth on the backend host.
        // In staging/prod this is cross-origin (api-*.hashpass.tech) and cannot use window.location.origin.
        const apiBaseUrl = this.resolveOAuthApiBaseUrl();
        const storedReturnTo = window.localStorage?.getItem('oauth_return_url') || '/dashboard/explore';
        const returnTo = storedReturnTo.replace(/\/\([^/]+\)/g, '') || '/dashboard/explore';

        // Use our proxy API to start OAuth
        const oauthUrl = `${apiBaseUrl}/auth/oauth/login?provider=${encodeURIComponent(provider)}&returnTo=${encodeURIComponent(returnTo)}`;

        console.log('🔐 Starting OAuth via proxy...');
        console.log('📍 OAuth URL:', oauthUrl);

        // Store return URL and redirect
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('oauth_return_url', window.location.pathname);
          window.localStorage.setItem('oauth_in_progress', 'true');
          window.location.href = oauthUrl;
        }

        // Return pending state since this is a redirect
        return { pending: true };
      } else {
        // Native: open OAuth through the API relay (/api/auth/oauth/login) so the
        // backend owns the provider redirect and the callback can hand the result back
        // to the app via the native scheme. We use the same apiBaseUrl as the web path
        // so the request hits the Lambda at api.hashpass.tech — NOT the Amplify static
        // host at hashpass.tech, which serves index.html for all unknown paths.
        const apiBaseUrl = this.resolveOAuthApiBaseUrl(); // e.g. https://api.hashpass.tech/api
        const nativeCallback = `hashpass://auth/callback`;
        const oauthUrl =
          `${apiBaseUrl}/auth/oauth/login` +
          `?provider=${encodeURIComponent(provider)}&native_callback=${encodeURIComponent(nativeCallback)}`;
        return { pending: true, oauthUrl };
      }
    } catch (error) {
      console.error('OAuth sign in error:', error);
      return { error: error instanceof Error ? error.message : 'OAuth sign in failed' };
    }
  }

  async handleOAuthCallback(codeOrParams: string | Record<string, string>, state?: string): Promise<AuthResponse> {
    try {
      const authFailures: Array<{ stage: string; message: string; status?: number; code?: string }> = [];

      const params: Record<string, string> = typeof codeOrParams === 'string'
        ? {
          code: codeOrParams,
          ...(state ? { state } : {}),
        }
        : codeOrParams;

      console.log('🔄 Processing Directus OAuth callback');

      // React Native polyfills `window` but not `window.location`. Guard both.
      const hasWindowLocation =
        typeof window !== 'undefined' && window.location != null;
      const urlParams = hasWindowLocation
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
      const hashParams = hasWindowLocation
        ? new URLSearchParams(window.location.hash.substring(1))
        : new URLSearchParams();

      // Merge tokens from: passed params (highest priority) → URL search → URL hash.
      // On native, urlParams/hashParams are empty so params is the only source.
      const authData: any = {
        access_token: params.access_token || urlParams.get('access_token') || hashParams.get('access_token'),
        token_type: params.token_type || urlParams.get('token_type') || hashParams.get('token_type'),
        expires_in: params.expires_in || urlParams.get('expires_in') || hashParams.get('expires_in'),
        expires: params.expires || urlParams.get('expires') || hashParams.get('expires'),
        scope: params.scope || urlParams.get('scope') || hashParams.get('scope'),
        state: params.state || urlParams.get('state') || hashParams.get('state'),
        code: params.code || urlParams.get('code'),
        session_token: params.session_token || urlParams.get('session_token'),
        user: params.user || urlParams.get('user'),
        directus_user: params.directus_user || urlParams.get('directus_user') || hashParams.get('directus_user'),
        token: params.token || urlParams.get('token'),
        refresh_token: params.refresh_token || urlParams.get('refresh_token') || hashParams.get('refresh_token'),
        oauth_success: params.oauth_success || urlParams.get('oauth_success') || hashParams.get('oauth_success'),
        user_id: params.user_id || urlParams.get('user_id') || hashParams.get('user_id'),
        email: params.email || urlParams.get('email') || hashParams.get('email'),
        reason: params.reason || urlParams.get('reason'),
        error: params.error || urlParams.get('error'),
        message: params.message || urlParams.get('message'),
      };

      // Log only string representations to avoid native Hermes exceptions with objects
      if (authData.access_token) {
        console.log('✅ Access token found: ' + authData.access_token.substring(0, 20) + '...');
      } else {
        console.log('⚠️ No access token in auth data');
      }

      if (authData.reason) {
        console.error('❌ Directus OAuth callback returned explicit failure reason:', authData.reason);
        return { error: this.mapDirectusOAuthReason(String(authData.reason)) };
      }

      const callbackError = authData.message || authData.reason || authData.error;
      if (callbackError && !authData.access_token && !authData.token && !authData.session_token) {
        console.error('❌ Directus OAuth callback returned an error response:', callbackError);
        return { error: String(callbackError) };
      }

      // Try using access token if available (either access_token or token)
      const token = authData.access_token || authData.token || authData.session_token;
      const directusUser = this.parseDirectusUserPayload(authData.directus_user);
      if (directusUser) {
        console.log('🔄 Found Directus user payload in OAuth callback; skipping /users/me lookup.');

        const normalizedUserData = {
          ...directusUser,
          email: directusUser.email || authData.email || this.session?.user?.email,
        };

        const session: AuthSession = {
          user: this.mapDirectusUser(normalizedUserData),
          access_token: token || 'oauth_session',
          refresh_token: authData.refresh_token || undefined,
          expires_at: authData.expires_in ? Date.now() + (parseInt(authData.expires_in, 10) * 1000) : undefined,
        };

        this.session = session;
        await this.storeSession(session.user, session.expires_at, this.isCookieBackedSession(session));

        console.log('🔔 Notifying auth state change (Directus payload-based)...');
        this.notifyStateChange(session);
        console.log('✅ Auth state change notification sent (Directus payload-based)');

        return { user: session.user, session };
      }

      if (token) {
        console.log('🔄 Found access token, attempting authentication...');
        console.log('🔍 Token details:', {
          type: authData.access_token ? 'access_token' : 'token',
          length: token.length,
          prefix: token.substring(0, 20) + '...'
        });

        try {
          const userResult = await this.apiClient.getCurrentUserWithToken(token);
          console.log('📡 Token auth result:', {
            success: !userResult.error,
            error: userResult.error?.message,
          });

          if (userResult.data) {
            console.log('✅ Token authentication successful:', userResult.data.email);

            const normalizedUserData = {
              ...userResult.data,
              email: userResult.data.email || authData.email || this.session?.user?.email,
            };

            const session: AuthSession = {
              user: this.mapDirectusUser(normalizedUserData),
              access_token: token,
              refresh_token: authData.refresh_token || undefined,
              expires_at: authData.expires_in ? Date.now() + (parseInt(authData.expires_in, 10) * 1000) : undefined
            };

            this.session = session;
            await this.storeSession(session.user, session.expires_at, this.isCookieBackedSession(session));

            console.log('🔔 Notifying auth state change (token-based)...');
            this.notifyStateChange(session);
            console.log('✅ Auth state change notification sent (token-based)');

            return { user: session.user, session: session };
          }

          if (userResult.error) {
            console.error('❌ Token authentication failed:', userResult.error);
            this.pushOAuthFailure(authFailures, 'token_user_lookup', userResult.error);
          }
        } catch (tokenError) {
          console.error('❌ Access token authentication failed:', tokenError);
          this.pushOAuthFailure(
            authFailures,
            'token_user_lookup',
            undefined,
            tokenError instanceof Error ? tokenError.message : 'Access token authentication request failed'
          );
        }
      }

      // First attempt session-cookie auth.
      // This is the expected path when AUTH_*_MODE=session.
      let lastSessionLookupError: DirectusApiError | null = null;
      try {
        console.log('🔄 Attempting cookie-based authentication...');

        const sessionProbeDelaysMs = [1000, 700];

        for (let attempt = 0; attempt < sessionProbeDelaysMs.length; attempt += 1) {
          await new Promise(resolve => setTimeout(resolve, sessionProbeDelaysMs[attempt]));

          const userResult = await this.apiClient.getCurrentUserWithSession();
          console.log(`📡 Cookie auth result (attempt ${attempt + 1}/${sessionProbeDelaysMs.length}):`, {
            success: !userResult.error,
            error: userResult.error?.message,
          });

          if (userResult.data) {
            console.log('✅ Cookie authentication successful:', userResult.data.email);

            const session: AuthSession = {
              user: this.mapDirectusUser(userResult.data),
              access_token: 'session_based',
              refresh_token: undefined,
              expires_at: undefined
            };

            this.session = session;
            await this.storeSession(session.user, session.expires_at, this.isCookieBackedSession(session));

            console.log('🔔 Notifying auth state change...');
            this.notifyStateChange(session);
            console.log('✅ Auth state change notification sent');

            return { user: session.user, session: session };
          }

          if (!userResult.error) {
            break;
          }

          if (this.isRateLimited(userResult.error)) {
            this.nextSessionProbeAt = Date.now() + 15000;
            return {
              error: 'Authentication service is temporarily rate-limited. Please wait a few seconds and try again.'
            };
          }

          lastSessionLookupError = userResult.error;

          const shouldRetryInvalidCredentials =
            this.isInvalidCredentials(userResult.error) && attempt < sessionProbeDelaysMs.length - 1;

          if (shouldRetryInvalidCredentials) {
            console.warn('⚠️ Session lookup returned INVALID_CREDENTIALS. Retrying once after a short delay...');
            continue;
          }

          console.error('❌ Session check failed:', userResult.error);
          break;
        }

        if (lastSessionLookupError) {
          this.pushOAuthFailure(authFailures, 'session_user_lookup', lastSessionLookupError);
        }
      } catch (sessionError) {
        console.error('❌ Session check error:', sessionError);
        this.pushOAuthFailure(
          authFailures,
          'session_user_lookup',
          undefined,
          sessionError instanceof Error ? sessionError.message : 'Session validation request failed'
        );
      }

      // Additional fallback for session-mode deployments:
      // try refreshing the session cookie first, then probe /users/me again.
      if (lastSessionLookupError && this.isInvalidCredentials(lastSessionLookupError)) {
        try {
          console.log('🔄 Attempting session-cookie refresh authentication...');
          const sessionRefreshResult = await this.apiClient.refreshSessionWithSessionCookies();

          if (sessionRefreshResult.error) {
            if (this.isRateLimited(sessionRefreshResult.error)) {
              this.nextSessionProbeAt = Date.now() + 15000;
              return {
                error: 'Authentication service is temporarily rate-limited. Please wait a few seconds and try again.'
              };
            }

            const isExpectedMissingSessionCookie =
              sessionRefreshResult.error.code === 'INVALID_PAYLOAD' &&
              /refresh token is required/i.test(sessionRefreshResult.error.message);

            if (isExpectedMissingSessionCookie) {
              console.log('ℹ️ No session cookie available for session-mode refresh after OAuth callback.');
            } else {
              console.error('❌ Session-mode refresh failed:', sessionRefreshResult.error);
              this.pushOAuthFailure(authFailures, 'session_refresh_mode', sessionRefreshResult.error);
            }
          } else {
            const userResult = await this.apiClient.getCurrentUserWithSession();
            if (userResult.data) {
              const session: AuthSession = {
                user: this.mapDirectusUser(userResult.data),
                access_token: 'session_based',
                refresh_token: undefined,
                expires_at: undefined
              };

              this.session = session;
              await this.storeSession(session.user, session.expires_at, this.isCookieBackedSession(session));
              this.notifyStateChange(session);
              return { user: session.user, session };
            }

            if (userResult.error) {
              if (this.isRateLimited(userResult.error)) {
                this.nextSessionProbeAt = Date.now() + 15000;
                return {
                  error: 'Authentication service is temporarily rate-limited. Please wait a few seconds and try again.'
                };
              }

              this.pushOAuthFailure(authFailures, 'session_refresh_user_lookup', userResult.error);
            }
          }
        } catch (sessionRefreshError) {
          this.pushOAuthFailure(
            authFailures,
            'session_refresh_mode',
            undefined,
            sessionRefreshError instanceof Error
              ? sessionRefreshError.message
              : 'Session-mode refresh request failed'
          );
        }
      }

      // Fallback for AUTH_*_MODE=json: exchange refresh cookie for access token.
      try {
        console.log('🔄 Attempting cookie-based refresh authentication...');
        const refreshResult = await this.apiClient.refreshSessionWithCookies();
        if (refreshResult.data?.access_token) {
          const refreshedUser = await this.apiClient.getCurrentUserWithToken(refreshResult.data.access_token);
          if (refreshedUser.data) {
            const session = this.buildSessionFromToken(
              refreshedUser.data,
              refreshResult.data.access_token,
              refreshResult.data.refresh_token,
              refreshResult.data.expires
            );
            this.session = session;
            await this.storeSession(session.user, session.expires_at, this.isCookieBackedSession(session));
            this.notifyStateChange(session);
            return { user: session.user, session };
          }

          if (refreshedUser.error) {
            console.error('❌ Refreshed token user lookup failed:', refreshedUser.error);
            this.pushOAuthFailure(authFailures, 'refresh_user_lookup', refreshedUser.error);
          }
        }

        if (refreshResult.error) {
          if (this.isRateLimited(refreshResult.error)) {
            this.nextSessionProbeAt = Date.now() + 15000;
            return {
              error: 'Authentication service is temporarily rate-limited. Please wait a few seconds and try again.'
            };
          }

          const isExpectedNoRefreshCookie =
            refreshResult.error.code === 'INVALID_PAYLOAD' &&
            /refresh token is required/i.test(refreshResult.error.message);

          if (isExpectedNoRefreshCookie) {
            console.log('ℹ️ No refresh-token cookie available after OAuth callback.');
          } else {
            console.error('❌ Cookie refresh authentication failed:', refreshResult.error);
            this.pushOAuthFailure(authFailures, 'session_refresh', refreshResult.error);
          }
        }
      } catch (refreshError) {
        console.error('❌ Cookie refresh error:', refreshError);
        this.pushOAuthFailure(
          authFailures,
          'session_refresh',
          undefined,
          refreshError instanceof Error ? refreshError.message : 'Session refresh request failed'
        );
      }

      // All authentication attempts failed
      console.error('❌ OAuth callback failed after all authentication strategies:', authFailures);
      return {
        error: this.buildOAuthFailureMessage(authFailures),
      };

    } catch (error) {
      console.error('❌ OAuth callback error:', error);
      return { error: error instanceof Error ? error.message : 'OAuth callback failed' };
    }
  }

  async signOut(): Promise<{ error?: string }> {
    const sessionToClear = this.session;

    // If we have a session, try to logout from server.
    if (sessionToClear?.access_token) {
      try {
        if (this.isCookieBackedSession(sessionToClear)) {
          await this.apiClient.logoutSession();
        } else {
          await this.apiClient.logoutWithToken(sessionToClear.access_token);
        }
      } catch (error) {
        // Local sign-out should still succeed even if server-side logout fails.
        console.debug('Sign out request failed:', error);
      }
    }

    this.session = null;
    this.sessionLookupInFlight = null;
    this.nextSessionProbeAt = 0;
    await this.clearStoredSession();
    this.clearRefreshTimer();
    this.notifyStateChange(null);

    return {};
  }

  async getSession(): Promise<AuthSession | null> {
    // Return cached session when valid, unless cookie-backed profile is incomplete.
    if (this.session && this.isTokenValid(this.session)) {
      const shouldProbeForProfile =
        this.isCookieBackedSession(this.session) &&
        this.isProfileIncomplete(this.session) &&
        Date.now() >= this.nextSessionProbeAt;

      if (!shouldProbeForProfile) {
        return this.session;
      }
    }

    if (this.sessionLookupInFlight) {
      return this.sessionLookupInFlight;
    }

    if (Date.now() < this.nextSessionProbeAt) {
      return this.session;
    }

    this.sessionLookupInFlight = (async () => {
      // Try to refresh if we have a refresh token
      if (this.session?.refresh_token) {
        const refreshResult = await this.refreshSession();
        return refreshResult.session || null;
      }

      // On web, only probe the server during an active OAuth handoff.
      // Cookie-backed Directus sessions are not persisted locally, so probing on every
      // page load causes cross-origin noise without improving the restored session state.
      //
      // Gate purely on `oauth_in_progress` — NOT on merely being on the callback
      // route. `/auth/callback` is the SAME shared route every auth method lands
      // on, including Supabase magic-link and OTP verification, which have
      // nothing to do with Directus. The previous `|| onCallbackRoute` bypass
      // meant this probe fired unconditionally on 100% of magic-link/OTP
      // callbacks too — producing a CORS failure against the Directus SSO host
      // on every single one of them (confirmed live: "Cross-Origin Request
      // Blocked ... sso.hashpass.co/users/me" logged alongside an unrelated
      // Supabase session-establishment failure, misleadingly suggesting they
      // were connected). `oauth_in_progress` is set only by Directus's own
      // initiateOAuth and Better Auth's Google OAuth flow (see both providers'
      // `signInWithOAuth`), so it correctly identifies an actual OAuth handoff
      // regardless of which route the browser happens to be on.
      if (typeof window !== 'undefined' && Platform.OS === 'web') {
        const oauthInProgress = window.localStorage?.getItem('oauth_in_progress') === 'true';

        if (!oauthInProgress) {
          this.nextSessionProbeAt = Date.now() + 3000;
          return null;
        }

        try {
          const userResult = await this.apiClient.getCurrentUserWithSession();

          if (userResult.data) {
            console.log('📡 Retrieved session from server via cookies');
            const session: AuthSession = {
              user: this.mapDirectusUser(userResult.data),
              access_token: 'oauth_session',
              refresh_token: undefined,
              expires_at: undefined
            };

            this.session = session;
            await this.storeSession(session.user, session.expires_at, this.isCookieBackedSession(session));
            this.notifyStateChange(session);
            this.nextSessionProbeAt = Date.now() + 5000;
            return session;
          }

          if (this.isRateLimited(userResult.error)) {
            this.nextSessionProbeAt = Date.now() + 15000;
            return this.session;
          }

          // Optional fallback for json-mode deployments where refresh cookie is expected.
          if (userResult.error?.status === 401 || userResult.error?.code === 'INVALID_CREDENTIALS') {
            const refreshResult = await this.apiClient.refreshSessionWithCookies();

            if (this.isRateLimited(refreshResult.error)) {
              this.nextSessionProbeAt = Date.now() + 15000;
              return this.session;
            }

            if (refreshResult.data?.access_token) {
              const refreshedUser = await this.apiClient.getCurrentUserWithToken(refreshResult.data.access_token);
              if (refreshedUser.data) {
                const session = this.buildSessionFromToken(
                  refreshedUser.data,
                  refreshResult.data.access_token,
                  refreshResult.data.refresh_token,
                  refreshResult.data.expires
                );
                this.session = session;
                await this.storeSession(session.user, session.expires_at, this.isCookieBackedSession(session));
                this.notifyStateChange(session);
                this.nextSessionProbeAt = Date.now() + 5000;
                return session;
              }
            }
          }
        } catch (error) {
          console.debug('No server session found:', error);
        }
      }

      this.nextSessionProbeAt = Date.now() + 3000;
      return null;
    })();

    try {
      return await this.sessionLookupInFlight;
    } finally {
      this.sessionLookupInFlight = null;
    }
  }

  async refreshSession(): Promise<AuthResponse> {
    if (!this.session?.refresh_token) {
      return { error: 'No refresh token available' };
    }

    try {
      const refreshResult = await this.apiClient.refreshToken(this.session.refresh_token);
      if (refreshResult.error || !refreshResult.data?.access_token) {
        await this.signOut();
        return { error: refreshResult.error?.message || 'Token refresh failed' };
      }

      const updatedSession: AuthSession = {
        ...this.session,
        access_token: refreshResult.data.access_token,
        refresh_token: refreshResult.data.refresh_token || this.session.refresh_token,
        expires_at: refreshResult.data.expires ? Date.now() + (refreshResult.data.expires * 1000) : undefined
      };

      this.session = updatedSession;
      await this.storeSession(updatedSession.user, updatedSession.expires_at, this.isCookieBackedSession(updatedSession));
      this.setupRefreshTimer();
      this.notifyStateChange(updatedSession);

      return { user: updatedSession.user, session: updatedSession };
    } catch (error) {
      console.error('Token refresh error:', error);
      await this.signOut();
      return { error: 'Token refresh failed' };
    }
  }

  isAuthenticated(): boolean {
    return this.session !== null && this.isTokenValid(this.session);
  }

  getUser(): AuthUser | null {
    return this.session?.user || null;
  }

  onAuthStateChange(callback: AuthStateChangeCallback): () => void {
    this.stateChangeCallbacks.push(callback);

    // Immediately call with current state
    callback(this.session);

    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  // Private helper methods
  private isTokenValid(session: AuthSession): boolean {
    if (!session.expires_at) return true;
    return Date.now() < session.expires_at - 60000; // Refresh 1 minute before expiry
  }

  private notifyStateChange(session: AuthSession | null): void {
    this.stateChangeCallbacks.forEach(callback => {
      try {
        callback(session);
      } catch (error) {
        console.error('Auth state change callback error:', error);
      }
    });
  }

  private setupRefreshTimer(): void {
    this.clearRefreshTimer();

    if (this.session?.expires_at) {
      const refreshTime = this.session.expires_at - Date.now() - 60000; // Refresh 1 minute before expiry
      if (refreshTime > 0) {
        this.refreshTimer = setTimeout(() => {
          this.refreshSession();
        }, refreshTime);
      }
    }
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private async getStoredSession(): Promise<AuthSession | null> {
    try {
      const key = 'hashpass_directus_session';
      let stored: string | null = null;

      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        stored = localStorage.getItem(key);
      } else if (Platform.OS !== 'web') {
        const SecureStore = getSecureStore();
        stored = await SecureStore.getItemAsync(key);
      }

      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Error getting stored session:', error);
      return null;
    }
  }

  private async storeSession(user: AuthUser, expiresAt?: number, cookieBacked = false): Promise<void> {
    try {
      const key = 'hashpass_directus_session';
      // Do not persist cookie-backed pseudo sessions; they must be revalidated per runtime.
      if (cookieBacked) {
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
          localStorage.removeItem(key);
        } else if (Platform.OS !== 'web') {
          const SecureStore = getSecureStore();
          await SecureStore.deleteItemAsync(key);
        }
        return;
      }
      const persistedSession = {
        user,
        access_token: 'session_based',
        provider: 'directus',
        expires_at: expiresAt,
      };
      const value = JSON.stringify(persistedSession);

      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(key, value);
      } else if (Platform.OS !== 'web') {
        const SecureStore = getSecureStore();
        await SecureStore.setItemAsync(key, value);
      }
    } catch (error) {
      console.error('Error storing session:', error);
    }
  }

  private async clearStoredSession(): Promise<void> {
    try {
      const key = 'hashpass_directus_session';

      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(key);
      } else if (Platform.OS !== 'web') {
        const SecureStore = getSecureStore();
        await SecureStore.deleteItemAsync(key);
      }
    } catch (error) {
      console.error('Error clearing stored session:', error);
    }
  }
}
