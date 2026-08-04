import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import { resolveNotificationIdentity, isResolveIdentityError } from '@/lib/server/resolve-notification-identity';
import { eventIdFromRequest } from '@/lib/server/event-api';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveScheduleUserId(identity: { registryUserId: string | null; supabaseUserId: string | null }): string | null {
  if (identity.registryUserId && UUID_PATTERN.test(identity.registryUserId)) {
    return identity.registryUserId;
  }
  return identity.supabaseUserId && UUID_PATTERN.test(identity.supabaseUserId) ? identity.supabaseUserId : null;
}

// POST /api/events/:eventId/schedule/share-token — issues (or reuses) an
// opaque, unguessable token that resolves to the caller's own confirmed
// agenda for this event via GET /api/events/:eventId/schedule/public/:token,
// with no auth required on that read side. Safe to hand out publicly: it
// only exposes session titles/times/locations already visible on this
// event's own public agenda, attributed to no name beyond whatever the
// sharer chooses to put in front of the link themselves.
export async function POST(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return Response.json({ error: identity.error }, { status: identity.status });
  }
  const userId = resolveScheduleUserId(identity);
  if (!userId) {
    return Response.json({ error: 'Account is not linked to an identity that can hold a share token' }, { status: 403 });
  }

  const eventId = eventIdFromRequest(request);
  if (!eventId) {
    return Response.json({ error: 'A valid event id is required' }, { status: 400 });
  }

  const supabase = getSupabaseServerForRequest(request);
  try {
    const { data: existing, error: selectError } = await supabase
      .from('user_schedule_shares')
      .select('share_token')
      .eq('user_id', userId)
      .eq('event_id', eventId)
      .maybeSingle();
    if (selectError) throw selectError;

    if (existing?.share_token) {
      return Response.json({ shareToken: existing.share_token });
    }

    const { data: inserted, error: insertError } = await supabase
      .from('user_schedule_shares')
      .insert({ user_id: userId, event_id: eventId })
      .select('share_token')
      .single();
    if (insertError) throw insertError;

    return Response.json({ shareToken: inserted.share_token });
  } catch (error) {
    console.error('[schedule-share-token] error:', error);
    return Response.json({ error: 'Failed to create share link' }, { status: 500 });
  }
}
