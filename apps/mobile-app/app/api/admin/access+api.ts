import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from '@/lib/server/resolve-notification-identity';
import { getEffectiveRole, isRoleActive } from '@/lib/role-summary';

const ADMIN_ROLES = new Set(['super_admin', 'admin']);
const EVENT_ROLES = new Set(['event_admin', 'moderator']);

/**
 * Returns the caller's effective administrative access. This route is needed
 * for provider-agnostic auth: Directus user IDs do not equal Supabase
 * auth.users IDs, which own user_roles and event_roles.
 */
export async function GET(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return Response.json({ error: identity.error }, { status: identity.status });
  }
  if (!identity.supabaseUserId) {
    return Response.json({ error: 'Account is not linked to an administrative identity' }, { status: 403 });
  }

  const supabase = getSupabaseServerForRequest(request);
  const [globalResult, eventResult] = await Promise.all([
    supabase
      .from('user_roles')
      .select('role, expires_at')
      .eq('user_id', identity.supabaseUserId)
      .in('role', [...ADMIN_ROLES]),
    supabase
      .from('event_roles')
      .select('event_id, role, expires_at')
      .eq('user_id', identity.supabaseUserId),
  ]);

  if (globalResult.error || eventResult.error) {
    console.error('Unable to load administrative access:', globalResult.error || eventResult.error);
    return Response.json({ error: 'Unable to load administrative access' }, { status: 500 });
  }

  const now = Date.now();
  const globalRoles = (globalResult.data || [])
    .filter((row: { role: string; expires_at: string | null }) =>
      ADMIN_ROLES.has(row.role) && isRoleActive(row.expires_at, now)
    )
    .map((row: { role: string }) => row.role);
  const globalRole = globalRoles.includes('super_admin')
    ? 'super_admin'
    : globalRoles.includes('admin')
      ? 'admin'
      : null;
  const eventRoles = (eventResult.data || [])
    .filter((row: { role: string; expires_at: string | null }) =>
      EVENT_ROLES.has(row.role) && isRoleActive(row.expires_at, now)
    )
    .map((row: { event_id: string; role: 'event_admin' | 'moderator' }) => ({
      eventId: row.event_id,
      role: row.role,
    }));

  return Response.json({
    data: {
      globalRole,
      eventRoles,
      effectiveRole: getEffectiveRole(globalRole, eventRoles),
    },
  });
}
