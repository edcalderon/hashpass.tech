/**
 * Main authentication service - Provider agnostic
 */

import type { IAuthProvider, ApiAuthResponse, AuthUser, AuthSession } from './types';
import { createAuthProviderFromEnv, resolveAuthProviderConfig } from './factory';
import { DirectusApiClient } from './providers/directus-api-client';

let authInstance: IAuthProvider | null = null;

export function getAuthService(): IAuthProvider {
  if (!authInstance) {
    authInstance = createAuthProviderFromEnv();
  }
  return authInstance;
}

export const authService = getAuthService();

const normalizeHostname = (value?: string | null): string => {
  const raw = (value || '').trim().toLowerCase();
  if (!raw) return '';

  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return raw.split('/')[0].split(':')[0].toLowerCase();
  }
};

const hostnameFromRequest = (request: Request): string => {
  const origin = request.headers.get('origin') || request.headers.get('referer') || '';
  if (origin) return normalizeHostname(origin);

  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) return normalizeHostname(forwardedHost);

  const host = request.headers.get('host');
  if (host) return normalizeHostname(host);

  return normalizeHostname(request.url);
};

const originFromRequest = (request: Request): string => {
  try {
    const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
    const forwardedHost = request.headers.get('x-forwarded-host');
    const host = forwardedHost || request.headers.get('host');

    if (host) {
      return `${forwardedProto.split(',')[0]}://${host.split(',')[0]}`;
    }

    return new URL(request.url).origin;
  } catch {
    return '';
  }
};

export function extractToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  if (authHeader.startsWith('Bearer ')) return authHeader.substring(7);
  return authHeader;
}

export async function verifyUserToken(
  token: string,
  requestOrHostname?: Request | { hostname?: string | null }
): Promise<ApiAuthResponse> {
  try {
    if (!token) return { user: null, error: 'No token provided' };

    const hostname =
      requestOrHostname instanceof Request
        ? hostnameFromRequest(requestOrHostname)
        : normalizeHostname(requestOrHostname?.hostname);
    const providerConfig = resolveAuthProviderConfig({ hostname });
    const providerName = providerConfig.provider;

    if (providerName === 'directus') {
      const directusUrl = providerConfig.directus?.url || 'https://sso.hashpass.co';
      const directusClient = new DirectusApiClient(directusUrl);
      const result = await directusClient.getCurrentUserWithToken(token);

      if (result.error) {
        if (result.error.status === 401) return { user: null, error: 'Invalid or expired token' };
        return { user: null, error: result.error.message || 'Token verification failed' };
      }

      if (!result.data) return { user: null, error: 'No user data returned' };

      const user = {
        id: result.data.id,
        email: result.data.email,
        first_name: result.data.first_name,
        last_name: result.data.last_name,
        role: result.data.role,
        status: result.data.status,
        last_access: result.data.last_access,
        last_page: result.data.last_page,
      };
      return { user, error: null };
    }
    if (providerName === 'supabase') {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        providerConfig.supabase?.url || '',
        providerConfig.supabase?.anonKey || ''
      );
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return { user: null, error: error?.message || 'Invalid token' };
      const mappedUser = {
        id: user.id,
        email: user.email || '',
        first_name: user.user_metadata?.first_name || user.user_metadata?.full_name?.split(' ')[0] || '',
        last_name: user.user_metadata?.last_name || user.user_metadata?.full_name?.slice(1).join(' ') || '',
        role: user.user_metadata?.role || user.role || 'user',
        status: user.user_metadata?.status || 'active',
        last_access: user.last_sign_in_at || undefined,
      };
      return { user: mappedUser, error: null };
    }
    if (providerName === 'better-auth') {
      return { user: null, error: 'Better Auth uses cookie-backed sessions. Use authenticateRequest(request).' };
    }
    return { user: null, error: 'Unsupported auth provider' };
  } catch (error) {
    console.error('Error verifying token:', error);
    return { user: null, error: 'Token verification failed' };
  }
}

export async function authenticateRequest(request: Request): Promise<ApiAuthResponse> {
  const token = extractToken(request);
  const hostname = hostnameFromRequest(request);
  const providerConfig = resolveAuthProviderConfig({ hostname });

  if (providerConfig.provider === 'better-auth') {
    return verifyBetterAuthRequest(request, providerConfig.betterAuth?.basePath || '/api/auth');
  }

  if (!token) return { user: null, error: 'No authorization token provided' };
  return verifyUserToken(token, request);
}

async function verifyBetterAuthRequest(
  request: Request,
  basePath: string
): Promise<ApiAuthResponse> {
  const cookie = request.headers.get('cookie') || request.headers.get('Cookie') || '';
  if (!cookie) return { user: null, error: 'No Better Auth session cookie provided' };

  const origin = originFromRequest(request);
  if (!origin) return { user: null, error: 'Could not resolve request origin' };

  try {
    const sessionUrl = new URL(`${basePath.replace(/\/$/, '')}/get-session`, origin);
    const response = await fetch(sessionUrl.toString(), {
      method: 'GET',
      headers: {
        Cookie: cookie,
        Accept: 'application/json',
        'x-forwarded-host': request.headers.get('x-forwarded-host') || request.headers.get('host') || '',
        'x-forwarded-proto': request.headers.get('x-forwarded-proto') || 'https',
      },
    });

    if (!response.ok) {
      return { user: null, error: `Better Auth session verification failed: ${response.status}` };
    }

    const payload = await response.json().catch(() => null);
    const betterAuthUser = payload?.user || payload?.data?.user;
    if (!betterAuthUser?.id) {
      return { user: null, error: 'No Better Auth session found' };
    }

    const [firstName, ...lastNameParts] = String(betterAuthUser.name || '').trim().split(/\s+/);
    return {
      user: {
        id: betterAuthUser.id,
        email: betterAuthUser.email || '',
        first_name: betterAuthUser.first_name || betterAuthUser.firstName || firstName || '',
        last_name: betterAuthUser.last_name || betterAuthUser.lastName || lastNameParts.join(' '),
        role: betterAuthUser.role || 'user',
        status: betterAuthUser.banned ? 'banned' : 'active',
        image: betterAuthUser.image,
        emailVerified: betterAuthUser.emailVerified,
        user_metadata: {
          name: betterAuthUser.name,
          provider: 'better-auth',
        },
      },
      error: null,
    };
  } catch (error) {
    console.error('Error verifying Better Auth session:', error);
    return { user: null, error: 'Better Auth session verification failed' };
  }
}

export function isAdmin(user: any): boolean {
  if (typeof user?.role === 'string') {
    return ['admin', 'administrator', 'superAdmin'].includes(user.role);
  }
  return false;
}

export async function requireAuth(request: Request) {
  const { user, error } = await authenticateRequest(request);
  if (error || !user) throw new Error(error || 'Authentication required');
  return user;
}

export async function requireAdminAuth(request: Request) {
  const user = await requireAuth(request);
  if (!isAdmin(user)) throw new Error('Admin access required');
  return user;
}
