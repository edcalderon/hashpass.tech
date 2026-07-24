import { authenticateRequest } from '@hashpass/auth';
import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import { rateLimitOk } from '@/lib/bsl/rateLimit';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ROLES = new Set(['event_admin', 'moderator']);
const ACTIONS = new Set(['grant', 'revoke']);

/**
 * POST /api/admin/roles — grant/revoke event_admin or moderator for an event.
 *
 * Authorization is enforced entirely inside admin_mutate_event_role (only a
 * super_admin may touch event_admin; a super_admin or that event's own
 * event_admin may touch moderator) — this route authenticates the caller and
 * validates shape, then lets the RPC be the single source of truth so the
 * escalation rule can't drift between JS and SQL.
 */
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimitOk(`admin-roles:${ip}`)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'A JSON body is required' }, { status: 400 });
  }

  const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
  const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId.trim() : '';
  const role = typeof body.role === 'string' ? body.role : '';
  const action = typeof body.action === 'string' ? body.action : '';
  const expiresAt = typeof body.expiresAt === 'string' ? body.expiresAt : null;

  if (!EVENT_ID_PATTERN.test(eventId) || !UUID_PATTERN.test(targetUserId) || !ROLES.has(role) || !ACTIONS.has(action)) {
    return Response.json({ error: 'A valid eventId, targetUserId, role, and action are required' }, { status: 400 });
  }
  if (expiresAt !== null && Number.isNaN(Date.parse(expiresAt))) {
    return Response.json({ error: 'expiresAt must be a valid date string' }, { status: 400 });
  }

  const { user, error: authError } = await authenticateRequest(request);
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseServerForRequest(request);
  const { data, error } = await supabase.rpc('admin_mutate_event_role', {
    p_actor_user_id: user.id,
    p_event_id: eventId,
    p_action: action,
    p_target_user_id: targetUserId,
    p_role: role,
    p_expires_at: expiresAt,
  });

  if (error) {
    console.error('Role mutation failed:', error.message);
    const status = error.code === '42501' ? 403 : error.code === '22023' ? 400 : 500;
    return Response.json(
      { error: status === 403 ? 'Forbidden' : status === 400 ? error.message : 'Unable to update role' },
      { status }
    );
  }

  return Response.json({ data });
}
