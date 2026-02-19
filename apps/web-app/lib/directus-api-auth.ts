/**
 * Authentication utilities for API endpoints using Directus SSO
 */

import { DirectusUser } from './directus-auth';
import type { Request } from 'express';
import { DirectusApiClient } from './auth/providers/directus-api-client';

const DIRECTUS_URL =
  process.env.EXPO_PUBLIC_DIRECTUS_URL ||
  process.env.DIRECTUS_URL ||
  'https://sso.hashpass.co';

// Type for authenticated request
export interface AuthenticatedRequest extends Request {
  user: DirectusUser;
}

/**
 * Extract and validate Directus access token from request
 */
export function extractToken(request: Request): string | null {
  const authHeader = request.headers.authorization;
  
  if (!authHeader) {
    return null;
  }
  
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  return authHeader;
}

/**
 * Verify user authentication and return user data
 * Replaces Supabase's supabase.auth.getUser(token)
 */
export async function verifyUserToken(token: string): Promise<{ user: DirectusUser | null; error: string | null }> {
  try {
    if (!token) {
      return { user: null, error: 'No token provided' };
    }

    const directusClient = new DirectusApiClient(DIRECTUS_URL);
    const result = await directusClient.getCurrentUserWithToken(token);

    if (result.error) {
      if (result.error.status === 401) {
        return { user: null, error: 'Invalid or expired token' };
      }
      return { user: null, error: result.error.message || 'Token verification failed' };
    }

    if (!result.data) {
      return { user: null, error: 'No user data returned' };
    }

    // Map Directus user to our DirectusUser format
    const user: DirectusUser = {
      id: result.data.id,
      email: result.data.email,
      first_name: result.data.first_name,
      last_name: result.data.last_name,
      role: result.data.role,
      status: result.data.status,
      last_access: result.data.last_access,
      last_page: result.data.last_page
    };

    return { user, error: null };
  } catch (error) {
    console.error('Error verifying token:', error);
    return { user: null, error: 'Token verification failed' };
  }
}

/**
 * Middleware function to authenticate API requests
 * Usage: const { user, error } = await authenticateRequest(request);
 */
export async function authenticateRequest(request: Request): Promise<{ user: DirectusUser | null; error: string | null }> {
  const token = extractToken(request);
  
  if (!token) {
    return { user: null, error: 'No authorization token provided' };
  }
  
  return await verifyUserToken(token);
}

/**
 * Check if user has admin role
 */
export function isAdmin(user: DirectusUser): boolean {
  // Check if user has admin role (adjust based on your Directus role configuration)
  return user.role === 'admin' || user.role === 'administrator';
}

/**
 * Require authentication for API endpoint
 * Throws error if not authenticated
 */
export async function requireAuth(request: Request): Promise<DirectusUser> {
  const { user, error } = await authenticateRequest(request);
  
  if (error || !user) {
    throw new Error(error || 'Authentication required');
  }
  
  return user;
}

/**
 * Require admin authentication for API endpoint
 * Throws error if not authenticated or not admin
 */
export async function requireAdminAuth(request: Request): Promise<DirectusUser> {
  const user = await requireAuth(request);
  
  if (!isAdmin(user)) {
    throw new Error('Admin access required');
  }
  
  return user;
}
