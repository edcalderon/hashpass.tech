/**
 * Authentication utilities for API endpoints using Directus SSO
 */

import { directusAuth, DirectusUser } from './directus-auth';
import { Request } from 'express';

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

    // Make authenticated request to Directus to verify token and get user
    const response = await fetch(`${process.env.DIRECTUS_URL}/users/me`, {
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

    // Map Directus user to our DirectusUser format
    const user: DirectusUser = {
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