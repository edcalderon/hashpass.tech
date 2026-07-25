import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from '@/lib/server/resolve-notification-identity';

export async function authorizeEventAdmin(request: Request, eventId: string) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return { response: Response.json({ error: identity.error }, { status: identity.status }) } as const;
  }
  if (!identity.supabaseUserId) {
    return { response: Response.json({ error: 'Account is not linked to an administrative identity' }, { status: 403 }) } as const;
  }

  const supabase = getSupabaseServerForRequest(request);
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
