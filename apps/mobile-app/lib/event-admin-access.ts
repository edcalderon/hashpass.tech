import { supabase } from './supabase';

export type EventRole = 'event_admin' | 'moderator';

export interface EventRoleGrant {
  eventId: string;
  role: EventRole;
}

interface EventRoleRow {
  event_id: string;
  role: EventRole;
  expires_at: string | null;
}

/**
 * Unexpired event_admin/moderator grants for a user. Relies on the
 * event_roles_self_read RLS policy (db/migrations/V012), which permits a
 * user to read only their own rows via auth.uid() — safe to call from the
 * browser client with the user's own session.
 */
export async function getUserEventRoles(userId: string): Promise<EventRoleGrant[]> {
  try {
    const { data, error } = await supabase
      .from('event_roles')
      .select('event_id, role, expires_at')
      .eq('user_id', userId);

    if (error || !data) return [];

    const now = Date.now();
    return (data as EventRoleRow[])
      .filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > now)
      .map((row) => ({ eventId: row.event_id, role: row.role }));
  } catch {
    return [];
  }
}

export function highestEventRole(grants: EventRoleGrant[], eventId: string): EventRole | null {
  const forEvent = grants.filter((g) => g.eventId === eventId);
  if (forEvent.some((g) => g.role === 'event_admin')) return 'event_admin';
  if (forEvent.some((g) => g.role === 'moderator')) return 'moderator';
  return null;
}
