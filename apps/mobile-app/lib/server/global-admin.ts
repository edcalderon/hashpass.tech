import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from '@/lib/server/resolve-notification-identity';

/** Resolve a provider session and verify its linked account has global admin access. */
export async function authorizeGlobalAdmin(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return { response: Response.json({ error: identity.error }, { status: identity.status }) } as const;
  }
  if (!identity.supabaseUserId) {
    return { response: Response.json({ error: 'Account is not linked to an administrative identity' }, { status: 403 }) } as const;
  }

  const supabase = getSupabaseServerForRequest(request);
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', identity.supabaseUserId)
    .in('role', ['super_admin', 'admin'])
    .limit(1);

  if (error) {
    console.error('Unable to verify global admin access:', error.message);
    return { response: Response.json({ error: 'Unable to verify administrative access' }, { status: 500 }) } as const;
  }
  if (!data || data.length === 0) {
    return { response: Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 }) } as const;
  }

  return { userId: identity.supabaseUserId, supabase } as const;
}
