import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from '@/lib/server/resolve-notification-identity';
import { getEventSupabaseProfileId } from '@/lib/server/event-supabase-profile';

export async function authorizeEventAdmin(request: Request, eventId: string) {
  const bslProfile = getEventSupabaseProfileId(request, eventId);

  const identity = await resolveNotificationIdentity(request, bslProfile);
  if (isResolveIdentityError(identity)) {
    return { response: Response.json({ error: identity.error }, { status: identity.status }) } as const;
  }
  if (!identity.supabaseUserId) {
    return { response: Response.json({ error: 'Account is not linked to an administrative identity' }, { status: 403 }) } as const;
  }

  // Local Expo API calls use localhost regardless of the event tenant. Select
  // the BSL project explicitly for BSL event IDs so admin requests do not hit
  // the core development database (where the BSL admin RPCs are absent).
  const supabase = getSupabaseServerForRequest(request, bslProfile);
  const { data, error } = await supabase.rpc('has_event_admin_access', {
    p_user_id: identity.supabaseUserId,
    p_event_id: eventId,
    p_include_moderator: false,
  });

  if (error) {
    console.error('Event administrator authorization failed:', error.message);
    return { response: Response.json({ error: 'Unable to authorize request' }, { status: 500 }) } as const;
  }
  if (!data) {
    return { response: Response.json({ error: 'Forbidden' }, { status: 403 }) } as const;
  }

  return { userId: identity.supabaseUserId, supabase } as const;
}

export interface EventAttendee {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  ticketType: string | null;
}

/**
 * Fully paginates admin_list_event_attendees (event-membership resolved
 * through passes, not a platform-wide user search) so callers get the
 * complete attendee list for the event rather than a single capped page.
 */
export async function listEventAttendees(
  supabase: ReturnType<typeof getSupabaseServerForRequest>,
  actorUserId: string,
  eventId: string,
): Promise<EventAttendee[]> {
  const pageSize = 200;
  const attendees: EventAttendee[] = [];
  let cursor: string | null = null;
  for (;;) {
    const { data, error } = await supabase.rpc('admin_list_event_attendees', {
      p_actor_user_id: actorUserId,
      p_event_id: eventId,
      p_query: '',
      p_limit: pageSize,
      p_cursor: cursor,
    });
    if (error) throw error;
    const rows: any[] = data || [];
    const page = rows.slice(0, pageSize);
    for (const row of page) {
      if (row.email) attendees.push({ id: row.id, email: row.email, name: row.name, username: row.username, ticketType: row.ticket_type });
    }
    if (rows.length <= pageSize || page.length === 0) break;
    cursor = page[page.length - 1]?.id || null;
    if (!cursor) break;
  }
  return attendees;
}
