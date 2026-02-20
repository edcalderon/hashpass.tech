/**
 * Directus authentication provider implementation
 */

import {
  IAuthProvider,
  AuthUser,
  AuthSession,
  AuthResponse,
  AuthStateChangeCallback,
  AuthProvider
} from '../types';
import { Platform } from 'react-native';
import { DirectusApiClient, DirectusApiError } from './directus-api-client';

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
      await this.storeSession(session);
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

        // First check if OAuth is available on the server
        try {
          let providersResult = await this.apiClient.listAuthProviders();
          const isRetryableProviderLookupError = (message?: string) => {
            if (!message) return false;
            return /networkerror|failed to fetch|network request failed|connection reset/i.test(message);
          };

          // Directus may still be warming up right after restart; retry once for transient network failures.
          if (providersResult.error && isRetryableProviderLookupError(providersResult.error.message)) {
            await new Promise(resolve => setTimeout(resolve, 600));
            providersResult = await this.apiClient.listAuthProviders();
          }

          if (providersResult.error) {
            throw new Error(providersResult.error.message || 'OAuth not configured on server.');
          }
          const hasGoogleProvider = providersResult.data?.some((p: any) => p?.name === provider);
          if (!hasGoogleProvider) {
            throw new Error(`${provider} provider not configured.`);
          }
        } catch (fetchError) {
          console.error('OAuth availability check failed:', fetchError);
          return {
            error: `Google OAuth is not available on this server. Please contact the administrator to configure Google OAuth or use email/password authentication.`
          };
        }

        // For web, use our own API proxy to handle OAuth
        // This avoids cross-origin cookie issues by keeping everything server-side
        const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8081';
        const storedReturnTo = window.localStorage?.getItem('oauth_return_url') || '/dashboard/explore';
        const returnTo = storedReturnTo.replace(/\/\([^/]+\)/g, '') || '/dashboard/explore';

        const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || `${currentOrigin}/api`;
        const oauthUrl = `${apiBaseUrl}/auth/oauth/login?provider=${provider}&returnTo=${encodeURIComponent(returnTo)}`;

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
        // For mobile, we'd need to implement deep linking or web view
        // For now, return error asking user to use web
        return {
          error: 'OAuth authentication is currently only supported in web browsers. Please use the web app or email/password authentication.'
        };
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

      console.log('🔄 Processing Directus OAuth callback with params:', params);

      // First, let's try to see if there are any tokens or session info we can extract
      let authData: any = {};

      if (typeof window !== 'undefined') {
        // Check URL parameters and hash for any OAuth data
        const urlParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.substring(1));

        authData = {
          // Standard OAuth params
          access_token: params.access_token || urlParams.get('access_token') || hashParams.get('access_token'),
          token_type: params.token_type || urlParams.get('token_type') || hashParams.get('token_type'),
          expires_in: params.expires_in || urlParams.get('expires_in') || hashParams.get('expires_in'),
          expires: params.expires || urlParams.get('expires') || hashParams.get('expires'),
          scope: params.scope || urlParams.get('scope') || hashParams.get('scope'),
          state: params.state || urlParams.get('state') || hashParams.get('state'),
          // Additional possible params (Directus specific)
          code: params.code || urlParams.get('code'),
          session_token: params.session_token || urlParams.get('session_token'),
          user: params.user || urlParams.get('user'),
          // Check for Directus JSON mode tokens
          token: params.token || urlParams.get('token'), // Directus might pass token differently
          refresh_token: params.refresh_token || urlParams.get('refresh_token') || hashParams.get('refresh_token'),
          // Our OAuth proxy success flag
          oauth_success: params.oauth_success || urlParams.get('oauth_success') || hashParams.get('oauth_success'),
          user_id: params.user_id || urlParams.get('user_id') || hashParams.get('user_id'),
          email: params.email || urlParams.get('email') || hashParams.get('email'),
          reason: params.reason || urlParams.get('reason')
        };

        console.log('📋 Extracted auth data:', authData);

        // Clear the hash to prevent re-processing
        if (window.location.hash) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      }

      if (authData.reason) {
        console.error('❌ Directus OAuth callback returned explicit failure reason:', authData.reason);
        return { error: this.mapDirectusOAuthReason(String(authData.reason)) };
      }

      // Try using access token if available (either access_token or token)
      const token = authData.access_token || authData.token;
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
            await this.storeSession(session);

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
      try {
        console.log('🔄 Attempting cookie-based authentication...');

        // Add a small delay to ensure any cookies are properly set
        await new Promise(resolve => setTimeout(resolve, 1000));

        const userResult = await this.apiClient.getCurrentUserWithSession();
        console.log('📡 Cookie auth result:', {
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
          await this.storeSession(session);

          console.log('🔔 Notifying auth state change...');
          this.notifyStateChange(session);
          console.log('✅ Auth state change notification sent');

          return { user: session.user, session: session };
        }

        if (userResult.error) {
          if (this.isRateLimited(userResult.error)) {
            this.nextSessionProbeAt = Date.now() + 15000;
            return {
              error: 'Authentication service is temporarily rate-limited. Please wait a few seconds and try again.'
            };
          }

          console.error('❌ Session check failed:', userResult.error);
          this.pushOAuthFailure(authFailures, 'session_user_lookup', userResult.error);
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
            await this.storeSession(session);
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

      // For OAuth flows, try to check if there's an active server session.
      if (typeof window !== 'undefined') {
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
            await this.storeSession(session);
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
                await this.storeSession(session);
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
      await this.storeSession(updatedSession);
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
        // React Native
        const SecureStore = await import('expo-secure-store');
        stored = await SecureStore.getItemAsync(key);
      }

      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Error getting stored session:', error);
      return null;
    }
  }

  private async storeSession(session: AuthSession): Promise<void> {
    try {
      const key = 'hashpass_directus_session';
      // Do not persist cookie-backed pseudo sessions; they must be revalidated per runtime.
      if (this.isCookieBackedSession(session)) {
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
          localStorage.removeItem(key);
        } else if (Platform.OS !== 'web') {
          const SecureStore = await import('expo-secure-store');
          await SecureStore.deleteItemAsync(key);
        }
        return;
      }
      const value = JSON.stringify(session);

      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(key, value);
      } else if (Platform.OS !== 'web') {
        // React Native
        const SecureStore = await import('expo-secure-store');
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
        // React Native
        const SecureStore = await import('expo-secure-store');
        await SecureStore.deleteItemAsync(key);
      }
    } catch (error) {
      console.error('Error clearing stored session:', error);
    }
  }
}
