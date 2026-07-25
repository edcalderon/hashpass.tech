import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from '@/lib/server/resolve-notification-identity';
import { isRoleActive } from '@/lib/role-summary';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authorizeSuperAdmin(request: Request) {
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
    .select('role, expires_at')
    .eq('user_id', identity.supabaseUserId)
    .eq('role', 'super_admin')
    .limit(1);

  if (error) {
    console.error('Unable to verify super-admin access:', error.message);
    return { response: Response.json({ error: 'Unable to verify administrative access' }, { status: 500 }) } as const;
  }
  if (!data || !data.some((row: { expires_at: string | null }) => isRoleActive(row.expires_at))) {
    return { response: Response.json({ error: 'Forbidden' }, { status: 403 }) } as const;
  }

  return { supabase } as const;
}

/** List global administrators. Super-admin-only. */
export async function GET(request: Request) {
  const authorization = await authorizeSuperAdmin(request);
  if ('response' in authorization) return authorization.response;

  const { data, error } = await authorization.supabase
    .from('user_roles')
    .select('id, user_id, role, created_at, expires_at')
    .in('role', ['super_admin', 'admin'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Unable to list global administrators:', error.message);
    return Response.json({ error: 'Unable to list global administrators' }, { status: 500 });
  }

  return Response.json({ data: data || [] });
}

/** Grant or revoke the standard global admin role. Super-admin-only. */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'A JSON body is required' }, { status: 400 });
  }

  const action = typeof body.action === 'string' ? body.action : '';
  const targetEmail = typeof body.targetEmail === 'string' ? body.targetEmail.trim().toLowerCase() : '';
  const targetUserIdInput = typeof body.targetUserId === 'string' ? body.targetUserId.trim() : '';
  const hasTargetEmail = EMAIL_PATTERN.test(targetEmail);
  const hasTargetUserId = UUID_PATTERN.test(targetUserIdInput);
  if ((action !== 'grant' && action !== 'revoke') || (!hasTargetEmail && !hasTargetUserId)) {
    return Response.json({ error: 'A valid action and target email or user ID are required' }, { status: 400 });
  }

  const authorization = await authorizeSuperAdmin(request);
  if ('response' in authorization) return authorization.response;

  let targetUserId = targetUserIdInput || undefined;
  if (!targetUserId) {
    const { data: target, error: targetError } = await authorization.supabase
      .from('user')
      .select('provider_ids')
      .eq('email', targetEmail)
      .maybeSingle();
    targetUserId = target?.provider_ids?.supabase as string | undefined;

    if (targetError) {
      console.error('Unable to resolve target administrator:', targetError.message);
      return Response.json({ error: 'Unable to resolve target account' }, { status: 500 });
    }
    if (!targetUserId) {
      return Response.json({ error: 'No linked Supabase account exists for this email' }, { status: 400 });
    }
  }

  const mutation = action === 'grant'
    ? authorization.supabase
      .from('user_roles')
      .upsert({ user_id: targetUserId, role: 'admin' }, { onConflict: 'user_id,role' })
    : authorization.supabase
      .from('user_roles')
      .delete()
      .eq('user_id', targetUserId)
      .eq('role', 'admin');
  const { error } = await mutation;

  if (error) {
    console.error('Unable to mutate global administrator:', error.message);
    return Response.json({ error: 'Unable to update global administrator' }, { status: 500 });
  }

  return Response.json({ data: { action, email: targetEmail || null, userId: targetUserId, role: 'admin' } });
}
