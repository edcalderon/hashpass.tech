import { authenticateRequest } from '@hashpass/auth';
import { getSupabaseServerForRequest } from '@/lib/supabase-server';

export async function authorizeEventAdmin(request: Request, eventId: string) {
  const { user, error: authenticationError } = await authenticateRequest(request);
  if (authenticationError || !user) {
    return { response: Response.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  }

  const supabase = getSupabaseServerForRequest(request);
  const { data, error } = await supabase.rpc('has_event_admin_access', {
    p_user_id: user.id,
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

  return { userId: user.id, supabase } as const;
}
