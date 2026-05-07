/**
 * Main authentication service - Provider agnostic
 */

import type { IAuthProvider, ApiAuthResponse, AuthUser, AuthSession } from './types';
import { createAuthProviderFromEnv } from './factory';
import { DirectusApiClient } from './providers/directus-api-client';

let authInstance: IAuthProvider | null = null;

export function getAuthService(): IAuthProvider {
  if (!authInstance) {
    authInstance = createAuthProviderFromEnv();
  }
  return authInstance;
}

export const authService = getAuthService();

export function extractToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  if (authHeader.startsWith('Bearer ')) return authHeader.substring(7);
  return authHeader;
}

export async function verifyUserToken(token: string): Promise<ApiAuthResponse> {
  try {
    if (!token) return { user: null, error: 'No token provided' };
    const provider = getAuthService();
    const providerName = provider.getProviderName();
    if (providerName === 'directus') {
      const directusUrl =
        process.env.EXPO_PUBLIC_DIRECTUS_URL ||
        process.env.DIRECTUS_URL ||
        'https://sso.hashpass.co';
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
        process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''
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
    return { user: null, error: 'Unsupported auth provider' };
  } catch (error) {
    console.error('Error verifying token:', error);
    return { user: null, error: 'Token verification failed' };
  }
}

export async function authenticateRequest(request: Request): Promise<ApiAuthResponse> {
  const token = extractToken(request);
  if (!token) return { user: null, error: 'No authorization token provided' };
  return verifyUserToken(token);
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
