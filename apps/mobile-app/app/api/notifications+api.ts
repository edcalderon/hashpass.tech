import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import { resolveNotificationIdentity, isResolveIdentityError } from '@/lib/server/resolve-notification-identity';

// GET /api/notifications?limit=50 — list the authenticated user's notifications
export async function GET(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return Response.json({ error: identity.error }, { status: identity.status });
  }

  // No linked Supabase auth identity — the user has never had a session that
  // could have owned notifications rows. Empty list, not an error.
  if (!identity.supabaseUserId) {
    return Response.json({ data: [], resolvedUserId: null });
  }

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 50;

  const supabase = getSupabaseServerForRequest(request);
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', identity.supabaseUserId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[notifications] fetch error:', error);
      return Response.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }

    return Response.json({ data: data || [], resolvedUserId: identity.supabaseUserId });
  } catch (error) {
    console.error('[notifications] unexpected fetch error:', error);
    return Response.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

// PATCH /api/notifications — mark all of the authenticated user's unread
// notifications as read. Body is ignored; this is the "mark all read" action.
export async function PATCH(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return Response.json({ error: identity.error }, { status: identity.status });
  }
  if (!identity.supabaseUserId) {
    return Response.json({ success: true });
  }

  const supabase = getSupabaseServerForRequest(request);
  try {
    const { error } = await (supabase as any)
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', identity.supabaseUserId)
      .eq('is_read', false);

    if (error) {
      console.error('[notifications] mark-all-read error:', error);
      return Response.json({ error: 'Failed to mark notifications as read' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('[notifications] unexpected mark-all-read error:', error);
    return Response.json({ error: 'Failed to mark notifications as read' }, { status: 500 });
  }
}
