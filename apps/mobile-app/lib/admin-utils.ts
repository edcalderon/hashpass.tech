import { supabase } from './supabase';

/**
 * Admin tier hierarchy (matches the Postgres `user_role` enum — see
 * db/migrations/V001__init_core_schema.sql):
 * - super_admin: Highest level, full system access
 * - admin: Standard admin access
 *
 * There is no `moderator` value in the `user_role` enum. Querying for it (or
 * for the camelCase `superAdmin`) makes Postgres reject the whole `.in()`
 * list with "invalid input value for enum user_role", which silently broke
 * every admin check in this app (isAdmin always fell through to `false`).
 */

export type AdminRole = 'super_admin' | 'admin';

/**
 * Check if a user has any admin role (super_admin or admin)
 */
export async function isAdmin(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['super_admin', 'admin'])
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
      .in('role', ['super_admin', 'admin'])
      .order('role', { ascending: false }); // super_admin comes first alphabetically

    if (error || !data || data.length === 0) {
      return null;
    }

    // Return the highest role (super_admin > admin)
    const roles = data.map((r: { role: string }) => r.role as AdminRole);
    if (roles.includes('super_admin')) return 'super_admin';
    if (roles.includes('admin')) return 'admin';

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
    super_admin: 2,
    admin: 1,
  };

  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

/**
 * Check if user is super_admin
 */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  return hasAdminRole(userId, 'super_admin');
}

/**
 * Check if user is admin or higher
 */
export async function isAdminOrHigher(userId: string): Promise<boolean> {
  return hasAdminRole(userId, 'admin');
}

