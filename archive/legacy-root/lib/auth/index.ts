/**
 * Main authentication service - Provider agnostic
 */

export * from './types';
export * from './factory';

import { IAuthProvider, ApiAuthResponse, AuthenticatedRequest, AuthUser, AuthSession } from './types';
import { createAuthProviderFromEnv } from './factory';

// Create the singleton auth service instance
let authInstance: IAuthProvider | null = null;

export function getAuthService(): IAuthProvider {
  if (!authInstance) {
    authInstance = createAuthProviderFromEnv();
  }
  return authInstance;
}

// Export the default instance
export const authService = getAuthService();

/**
 * API Authentication utilities - Provider agnostic
 */

/**
 * Extract and validate access token from request
 */
export function extractToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader) {
    return null;
  }
  
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  return authHeader;
}

/**
 * Verify user authentication using the configured provider
 */
export async function verifyUserToken(token: string): Promise<ApiAuthResponse> {
  try {
    if (!token) {
      return { user: null, error: 'No token provided' };
    }

    const provider = getAuthService();
    const providerName = provider.getProviderName();

    if (providerName === 'directus') {
      // For Directus, we need to validate the token by making an API request
      const directusUrl = process.env.DIRECTUS_URL || 'https://sso.hashpass.co';
      const response = await fetch(`${directusUrl}/users/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          return { user: null, error: 'Invalid or expired token' };
        }
        return { user: null, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const data = await response.json();
      
      if (!data.data) {
        return { user: null, error: 'No user data returned' };
      }

      // Map Directus user to our standard format
      const user = {
        id: data.data.id,
        email: data.data.email,
        first_name: data.data.first_name,
        last_name: data.data.last_name,
        role: data.data.role,
        status: data.data.status,
        last_access: data.data.last_access,
        last_page: data.data.last_page
      };

      return { user, error: null };

    } else if (providerName === 'supabase') {
      // For Supabase, import and use the client
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''
      );

      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        return { user: null, error: error?.message || 'Invalid token' };
      }

      // Map Supabase user to our standard format
      const mappedUser = {
        id: user.id,
        email: user.email || '',
        first_name: user.user_metadata?.first_name || user.user_metadata?.full_name?.split(' ')[0] || '',
        last_name: user.user_metadata?.last_name || user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '',
        role: user.user_metadata?.role || user.role || 'user',
        status: user.user_metadata?.status || 'active',
        last_access: user.last_sign_in_at || undefined
      };

      return { user: mappedUser, error: null };
    }

    return { user: null, error: 'Unsupported auth provider' };
  } catch (error) {
    console.error('Error verifying token:', error);
    return { user: null, error: 'Token verification failed' };
  }
}

/**
 * Middleware function to authenticate API requests
 */
export async function authenticateRequest(request: Request): Promise<ApiAuthResponse> {
  const token = extractToken(request);
  
  if (!token) {
    return { user: null, error: 'No authorization token provided' };
  }
  
  return await verifyUserToken(token);
}

/**
 * Check if user has admin role
 */
export function isAdmin(user: any): boolean {
  if (typeof user.role === 'string') {
    return ['admin', 'administrator', 'superAdmin'].includes(user.role);
  }
  return false;
}

/**
 * Require authentication for API endpoint
 */
export async function requireAuth(request: Request) {
  const { user, error } = await authenticateRequest(request);
  
  if (error || !user) {
    throw new Error(error || 'Authentication required');
  }
  
  return user;
}

/**
 * Require admin authentication for API endpoint
 */
export async function requireAdminAuth(request: Request) {
  const user = await requireAuth(request);
  
  if (!isAdmin(user)) {
    throw new Error('Admin access required');
  }
  
  return user;
}

// Legacy exports for backward compatibility
export { authService as directusAuth };
export type { AuthUser as DirectusUser };
export type { AuthSession as DirectusSession };