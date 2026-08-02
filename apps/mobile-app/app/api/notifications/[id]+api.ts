import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import { resolveNotificationIdentity, isResolveIdentityError } from '@/lib/server/resolve-notification-identity';

type NotificationUpdateBody = {
  is_read?: boolean;
  is_archived?: boolean;
};

type NotificationRouteContext = {
  params?: {
    id?: string;
  };
};

// Metro's dev server does not reliably populate the route context's `params`
// for +api.ts handlers (confirmed via live reproduction, not just theory),
// so `context?.params?.id` alone silently 400s on requests that carry a
// perfectly valid id in the URL. Fall back to parsing it from the path
// itself, matching this repo's established pattern for dynamic API route
// segments (see eventIdFromRequest in lib/server/event-api.ts).
function notificationIdFromRequest(request: Request): string | null {
  const pathSegments = new URL(request.url).pathname.split('/').filter(Boolean);
  const notificationsIndex = pathSegments.indexOf('notifications');
  const id = notificationsIndex >= 0 ? pathSegments[notificationsIndex + 1] : undefined;
  return id ? decodeURIComponent(id) : null;
}

// PATCH /api/notifications/[id] — mark a single notification read/unread or archived.
export async function PATCH(request: Request, context?: NotificationRouteContext) {
  const notificationId = context?.params?.id?.trim() || notificationIdFromRequest(request);
  if (!notificationId) {
    return Response.json({ error: 'Notification ID is required' }, { status: 400 });
  }

  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return Response.json({ error: identity.error }, { status: identity.status });
  }
  if (!identity.supabaseUserId) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as NotificationUpdateBody | null;
  if (!body || (body.is_read === undefined && body.is_archived === undefined)) {
    return Response.json({ error: 'is_read or is_archived is required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {};
  if (body.is_read !== undefined) {
    update.is_read = body.is_read;
    update.read_at = body.is_read ? now : null;
  }
  if (body.is_archived !== undefined) {
    update.is_archived = body.is_archived;
    update.archived_at = body.is_archived ? now : null;
    // Archiving also marks as read, matching the prior client-side behavior.
    if (body.is_archived) {
      update.is_read = true;
      update.read_at = now;
    }
  }

  const supabase = getSupabaseServerForRequest(request);
  try {
    const { error } = await (supabase as any)
      .from('notifications')
      .update(update)
      .eq('id', notificationId)
      .eq('user_id', identity.supabaseUserId);

    if (error) {
      console.error('[notifications] update error:', error);
      return Response.json({ error: 'Failed to update notification' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('[notifications] unexpected update error:', error);
    return Response.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}

// DELETE /api/notifications/[id] — delete a single notification.
export async function DELETE(request: Request, context?: NotificationRouteContext) {
  const notificationId = context?.params?.id?.trim() || notificationIdFromRequest(request);
  if (!notificationId) {
    return Response.json({ error: 'Notification ID is required' }, { status: 400 });
  }

  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return Response.json({ error: identity.error }, { status: identity.status });
  }
  if (!identity.supabaseUserId) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const supabase = getSupabaseServerForRequest(request);
  try {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_id', identity.supabaseUserId);

    if (error) {
      console.error('[notifications] delete error:', error);
      return Response.json({ error: 'Failed to delete notification' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('[notifications] unexpected delete error:', error);
    return Response.json({ error: 'Failed to delete notification' }, { status: 500 });
  }
}
