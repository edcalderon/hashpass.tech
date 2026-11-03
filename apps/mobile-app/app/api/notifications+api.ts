import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import { resolveNotificationIdentity, isResolveIdentityError } from '@/lib/server/resolve-notification-identity';

// GET /api/notifications?limit=50&category=messages|updates — list the
// authenticated user's notifications. Categories are queried independently so
// a busy conversation cannot push action-required event updates out of the
// inbox window before the client separates the tabs.
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
  const category = url.searchParams.get('category');

  const supabase = getSupabaseServerForRequest(request);
  try {
    let query = (supabase as any)
      .from('notifications')
      .select('*')
      .eq('user_id', identity.supabaseUserId)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

    if (category === 'messages') {
      query = query.eq('type', 'chat_message');
    } else if (category === 'updates') {
      query = query.neq('type', 'chat_message');
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[notifications] fetch error:', error);
      return Response.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }

    const notificationRows = data || [];
    const meetingRequestIds = [...new Set(
      notificationRows
        .map((notification: { meeting_request_id?: unknown }) => notification.meeting_request_id)
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0),
    )];

    const eventIdByMeetingRequestId = new Map<string, string>();
    if (meetingRequestIds.length > 0) {
      const { data: meetingRequests, error: meetingRequestsError } = await supabase
        .from('meeting_requests')
        .select('id, event_id')
        .in('id', meetingRequestIds);

      if (meetingRequestsError) {
        console.error('[notifications] linked meeting request fetch error:', meetingRequestsError);
        return Response.json({ error: 'Failed to fetch notifications' }, { status: 500 });
      }

      for (const meetingRequest of meetingRequests || []) {
        if (typeof meetingRequest.id === 'string' && typeof meetingRequest.event_id === 'string') {
          eventIdByMeetingRequestId.set(meetingRequest.id, meetingRequest.event_id);
        }
      }
    }

    const enrichedNotifications = notificationRows.map((notification: { meeting_request_id?: string }) => ({
      ...notification,
      meeting_request_event_id: notification.meeting_request_id
        ? eventIdByMeetingRequestId.get(notification.meeting_request_id)
        : undefined,
    }));

    return Response.json({ data: enrichedNotifications, resolvedUserId: identity.supabaseUserId });
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
