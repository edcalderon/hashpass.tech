import { supabase } from './supabase';

/**
 * Admin tier hierarchy:
 * - superAdmin: Highest level, full system access
 * - admin: Standard admin access
 * - moderator: Limited admin access (read-only or restricted actions)
 */

export type AdminRole = 'superAdmin' | 'admin' | 'moderator';

/**
 * Check if a user has any admin role (superAdmin, admin, or moderator)
 */
export async function isAdmin(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['superAdmin', 'admin', 'moderator'])
      .limit(1); // Limit to 1 since we only need to check existence
    
    if (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
    
    return !!data && data.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get the highest admin role for a user
 */
export async function getUserAdminRole(userId: string): Promise<AdminRole | null> {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['superAdmin', 'admin', 'moderator'])
      .order('role', { ascending: false }); // superAdmin comes first alphabetically
    
    if (error || !data || data.length === 0) {
      return null;
    }
    
    // Return the highest role (superAdmin > admin > moderator)
    const roles = data.map(r => r.role as AdminRole);
    if (roles.includes('superAdmin')) return 'superAdmin';
    if (roles.includes('admin')) return 'admin';
    if (roles.includes('moderator')) return 'moderator';
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if user has a specific admin role or higher
 */
export async function hasAdminRole(userId: string, requiredRole: AdminRole): Promise<boolean> {
  const userRole = await getUserAdminRole(userId);
  if (!userRole) return false;
  
  const roleHierarchy: Record<AdminRole, number> = {
    superAdmin: 3,
    admin: 2,
    moderator: 1,
  };
  
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

/**
 * Check if user is superAdmin
 */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  return hasAdminRole(userId, 'superAdmin');
}

/**
 * Check if user is admin or higher
 */
export async function isAdminOrHigher(userId: string): Promise<boolean> {
  return hasAdminRole(userId, 'admin');
}

