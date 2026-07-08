/**
 * Supabase authentication provider implementation
 */

import type { 
  IAuthProvider,
  AuthUser,
  AuthSession,
  AuthResponse,
  AuthStateChangeCallback,
  AuthProvider
} from '../types';
import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { getSupabaseOAuthRedirectUrl, SUPABASE_OAUTH_CALLBACK_PATH } from '../supabase-oauth';

type SupabaseEmailOtpType = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email';

const SUPABASE_EMAIL_OTP_FALLBACK_TYPES: SupabaseEmailOtpType[] = [
  'magiclink',
  'email',
  'signup',
  'invite',
  'recovery',
  'email_change',
];

const normalizeSupabaseEmailOtpType = (rawType: string | null | undefined): SupabaseEmailOtpType => {
  const normalized = (rawType || 'magiclink').trim().toLowerCase();

  switch (normalized) {
    case 'email':
    case 'signup':
    case 'invite':
    case 'recovery':
    case 'email_change':
      return normalized;
    default:
      return 'magiclink';
  }
};

const getSupabaseEmailOtpTypeCandidates = (rawType: string | null | undefined): SupabaseEmailOtpType[] => {
  const candidates = [
    normalizeSupabaseEmailOtpType(rawType),
    ...SUPABASE_EMAIL_OTP_FALLBACK_TYPES,
  ];

  return candidates.filter((candidate, index) => candidates.indexOf(candidate) === index);
};

export class SupabaseAuthProvider implements IAuthProvider {
  private supabase: SupabaseClient;
  private currentSession: AuthSession | null = null;
  private stateChangeCallbacks: AuthStateChangeCallback[] = [];

  constructor(url: string, anonKey: string, existingClient?: SupabaseClient) {
    // Reuse an existing client when the host app already maintains a
    // Supabase singleton (e.g. apps/mobile-app/lib/supabase.ts). Creating a
    // second createClient() against the same project ref triggers GoTrueClient's
    // "Multiple GoTrueClient instances" warning and can race on session refresh
    // since both clients read/write the same storage key.
    this.supabase = existingClient ?? createClient(url, anonKey);
    this.initializeSession();
  }

  getProviderName(): AuthProvider {
    return 'supabase';
  }

  private async initializeSession(): Promise<void> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (session) {
        this.currentSession = this.mapSupabaseSession(session);
        this.notifyStateChange(this.currentSession);
      }

      // Listen for auth state changes
      this.supabase.auth.onAuthStateChange((event, session) => {
        this.currentSession = session ? this.mapSupabaseSession(session) : null;
        this.notifyStateChange(this.currentSession);
      });
    } catch (error) {
      console.error('Failed to initialize Supabase session:', error);
    }
  }

  async signInWithEmailAndPassword(email: string, password: string): Promise<AuthResponse> {
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: error.message };
      }

      if (!data.session || !data.user) {
        return { error: 'No session created' };
      }

      const session = this.mapSupabaseSession(data.session);
      this.currentSession = session;

      return { user: session.user, session };
    } catch (error) {
      console.error('Sign in error:', error);
      return { error: error instanceof Error ? error.message : 'Sign in failed' };
    }
  }

  async signInWithOAuth(provider: 'google' | 'github' | 'facebook' | 'twitter'): Promise<AuthResponse> {
    try {
      const isNative = Platform.OS !== 'web';
      const redirectTo = isNative
        ? getSupabaseOAuthRedirectUrl({
            callbackPath: `${SUPABASE_OAUTH_CALLBACK_PATH}?nativeRelay=1`,
            relayToNative: true,
          })
        : getSupabaseOAuthRedirectUrl();

      // On native we use skipBrowserRedirect so Supabase returns the URL without
      // trying to navigate, then the caller opens it via expo-web-browser.

      const { data, error } = await this.supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: isNative,
        },
      });

      if (error) {
        return { error: error.message };
      }

      if (isNative) {
        // Return the URL so the mobile caller can open it in a WebBrowser session
        return { pending: true, oauthUrl: data.url ?? undefined };
      }

      return { pending: true };
    } catch (error) {
      console.error('OAuth sign in error:', error);
      return { error: error instanceof Error ? error.message : 'OAuth sign in failed' };
    }
  }

  async handleOAuthCallback(codeOrParams: string | Record<string, string>, state?: string): Promise<AuthResponse> {
    try {
      // Supabase automatically handles the OAuth callback through its session management
      // but web callbacks still need explicit exchange / verification when the
      // session has not already been restored by the client.
      const params: Record<string, string> = typeof codeOrParams === 'string'
        ? {
          code: codeOrParams,
          ...(state ? { state } : {}),
        }
        : codeOrParams;

      const hasWindowLocation = typeof window !== 'undefined' && window.location != null;
      const urlSearchParams = hasWindowLocation ? new URLSearchParams(window.location.search) : new URLSearchParams();
      const urlHashParams = hasWindowLocation ? new URLSearchParams(window.location.hash.substring(1)) : new URLSearchParams();

      const authData = {
        access_token: params.access_token || urlSearchParams.get('access_token') || urlHashParams.get('access_token'),
        refresh_token: params.refresh_token || urlSearchParams.get('refresh_token') || urlHashParams.get('refresh_token'),
        code: params.code || urlSearchParams.get('code'),
        token_hash: params.token_hash || urlSearchParams.get('token_hash') || urlHashParams.get('token_hash'),
        token: params.token || urlSearchParams.get('token'),
        type: params.type || urlSearchParams.get('type') || urlHashParams.get('type'),
        email: params.email || urlSearchParams.get('email') || urlHashParams.get('email'),
      };

      const hydrateSessionUser = async (session: Session | null): Promise<Session | null> => {
        if (!session) {
          return null;
        }

        if (session.user) {
          return session;
        }

        try {
          const { data: { user } } = await this.supabase.auth.getUser();
          if (user) {
            return {
              ...session,
              user,
            } as Session;
          }
        } catch {
          // Fall back to reading the stored session below.
        }

        try {
          const { data: { session: refreshedSession } } = await this.supabase.auth.getSession();
          if (refreshedSession?.user) {
            return refreshedSession;
          }
        } catch {
          // Keep the original session if Supabase cannot re-read it.
        }

        return session;
      };

      const finalizeSession = async (session: Session | null): Promise<AuthResponse> => {
        if (!session) {
          const { data, error } = await this.supabase.auth.getSession();

          if (error) {
            return { error: error.message };
          }

          if (!data.session) {
            return { error: 'No session found after OAuth callback' };
          }

          session = data.session;
        }

        const hydratedSession = await hydrateSessionUser(session);
        if (!hydratedSession?.user) {
          return { error: 'No session found after OAuth callback' };
        }

        const mappedSession = this.mapSupabaseSession(hydratedSession);
        this.currentSession = mappedSession;
        return { user: mappedSession.user, session: mappedSession };
      };

      if (authData.access_token) {
        const { data, error } = await this.supabase.auth.setSession({
          access_token: authData.access_token,
          refresh_token: authData.refresh_token || '',
        });

        if (error) {
          return { error: error.message };
        }

        return await finalizeSession(data.session ?? null);
      }

      if (authData.code) {
        const { data, error } = await this.supabase.auth.exchangeCodeForSession(authData.code);

        if (error) {
          return { error: error.message };
        }

        return await finalizeSession(data.session ?? null);
      }

      if (authData.token_hash || (authData.token && authData.email)) {
        const candidateTypes = getSupabaseEmailOtpTypeCandidates(authData.type);
        let lastError: Error | null = null;

        for (const verificationType of candidateTypes) {
          try {
            const verifyParams = authData.token_hash
              ? { token_hash: authData.token_hash, type: verificationType }
              : { email: authData.email, token: authData.token, type: verificationType };

            const { data, error } = await this.supabase.auth.verifyOtp(verifyParams as any);

            if (error) {
              lastError = error;
              continue;
            }

            return await finalizeSession(data.session ?? null);
          } catch (verifyError: any) {
            lastError = verifyError instanceof Error ? verifyError : new Error(String(verifyError));
          }
        }

        if (lastError) {
          return { error: lastError.message };
        }
      }

      return await finalizeSession(null);
    } catch (error) {
      console.error('OAuth callback error:', error);
      return { error: error instanceof Error ? error.message : 'OAuth callback failed' };
    }
  }

  async signOut(): Promise<{ error?: string }> {
    try {
      const { error } = await this.supabase.auth.signOut();
      this.currentSession = null;

      if (error) {
        return { error: error.message };
      }

      return {};
    } catch (error) {
      console.error('Sign out error:', error);
      return { error: error instanceof Error ? error.message : 'Sign out failed' };
    }
  }

  async getSession(): Promise<AuthSession | null> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (session) {
        this.currentSession = this.mapSupabaseSession(session);
        return this.currentSession;
      }
      return null;
    } catch (error) {
      console.error('Get session error:', error);
      return null;
    }
  }

  async refreshSession(): Promise<AuthResponse> {
    try {
      const { data, error } = await this.supabase.auth.refreshSession();
      
      if (error) {
        return { error: error.message };
      }

      if (!data.session) {
        return { error: 'No session returned from refresh' };
      }

      const session = this.mapSupabaseSession(data.session);
      this.currentSession = session;

      return { user: session.user, session };
    } catch (error) {
      console.error('Refresh session error:', error);
      return { error: error instanceof Error ? error.message : 'Session refresh failed' };
    }
  }

  isAuthenticated(): boolean {
    return this.currentSession !== null;
  }

  getUser(): AuthUser | null {
    return this.currentSession?.user || null;
  }

  onAuthStateChange(callback: AuthStateChangeCallback): () => void {
    this.stateChangeCallbacks.push(callback);
    
    // Immediately call with current state
    callback(this.currentSession);
    
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  // Private helper methods
  private mapSupabaseSession(session: Session): AuthSession {
    const user: AuthUser = this.mapSupabaseUser(session.user);
    
    return {
      user,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at ? session.expires_at * 1000 : undefined,
      provider: 'supabase'
    };
  }

  private mapSupabaseUser(user: User): AuthUser {
    return {
      id: user.id,
      email: user.email || '',
      first_name: user.user_metadata?.first_name || user.user_metadata?.full_name?.split(' ')[0] || '',
      last_name: user.user_metadata?.last_name || user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '',
      role: user.user_metadata?.role || user.role || 'user',
      status: user.user_metadata?.status || 'active',
      last_access: user.last_sign_in_at || undefined,
      // Include additional Supabase-specific fields
      app_metadata: user.app_metadata,
      user_metadata: user.user_metadata,
      aud: user.aud,
      confirmation_sent_at: user.confirmation_sent_at,
      confirmed_at: user.confirmed_at,
      created_at: user.created_at,
      updated_at: user.updated_at,
      phone: user.phone,
      phone_confirmed_at: user.phone_confirmed_at,
      email_confirmed_at: user.email_confirmed_at,
      last_sign_in_at: user.last_sign_in_at
    };
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

  // Supabase-specific methods (can be accessed by casting the provider)
  getSupabaseClient(): SupabaseClient {
    return this.supabase;
  }
}
