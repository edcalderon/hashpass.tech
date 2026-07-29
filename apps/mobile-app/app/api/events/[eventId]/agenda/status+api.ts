import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import { resolveNotificationIdentity, isResolveIdentityError } from '@/lib/server/resolve-notification-identity';
import { eventIdFromRequest } from '@/lib/server/event-api';

// GET /api/events/:eventId/agenda/status — the authenticated
// user's per-session confirm/favorite status for one event.
//
// user_agenda_status.user_id is a uuid FK into public.user, but the
// authenticated caller's own id can be a Better Auth id (not a uuid) for
// accounts that never had a Supabase auth session. Querying that column
// directly with a non-uuid value is rejected by Postgres with a 400 before
// RLS is even evaluated, which is what the client was hitting calling
// Supabase directly. Resolving through resolveNotificationIdentity (same
// public.user registry lookup /api/notifications already relies on) avoids
// that entirely.
export async function GET(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return Response.json({ error: identity.error }, { status: identity.status });
  }

  if (!identity.registryUserId) {
    return Response.json({ data: [] });
  }

  const eventId = eventIdFromRequest(request);
  if (!eventId) {
    return Response.json({ error: 'A valid event id is required' }, { status: 400 });
  }

  const supabase = getSupabaseServerForRequest(request);
  try {
    const { data, error } = await supabase
      .from('user_agenda_status')
      .select('agenda_id, status, is_favorite')
      .eq('user_id', identity.registryUserId)
      .eq('event_id', eventId)
      .not('agenda_id', 'is', null);

    if (error) {
      console.error('[agenda-status] fetch error:', error);
      return Response.json({ error: 'Failed to fetch agenda status' }, { status: 500 });
    }

    return Response.json({ data: data || [] });
  } catch (error) {
    console.error('[agenda-status] unexpected fetch error:', error);
    return Response.json({ error: 'Failed to fetch agenda status' }, { status: 500 });
  }
}

// POST /api/events/:eventId/agenda/status — upsert the caller's confirm/favorite
// status for one agenda session. Body: { agendaId, status?,
// isFavorite? }. Only the fields provided are changed; omit `status` to
// toggle just the favorite flag (or vice versa) without touching the other.
export async function POST(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return Response.json({ error: identity.error }, { status: identity.status });
  }
  if (!identity.registryUserId) {
    return Response.json(
      { error: 'Account is not linked to an identity that can hold agenda status' },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const eventId = eventIdFromRequest(request);
  const agendaId: string | undefined = body?.agendaId;
  const status: string | undefined = body?.status;
  const isFavorite: boolean | undefined = body?.isFavorite;

  if (!eventId) {
    return Response.json({ error: 'A valid event id is required' }, { status: 400 });
  }
  if (!agendaId) {
    return Response.json({ error: 'agendaId is required' }, { status: 400 });
  }
  if (status === undefined && isFavorite === undefined) {
    return Response.json({ error: 'status or isFavorite is required' }, { status: 400 });
  }

  const supabase = getSupabaseServerForRequest(request);
  try {
    const { data: existing, error: lookupError } = await supabase
      .from('user_agenda_status')
      .select('id')
      .eq('user_id', identity.registryUserId)
      .eq('event_id', eventId)
      .eq('agenda_id', agendaId)
      .maybeSingle();

    if (lookupError) {
      console.error('[agenda-status] lookup error:', lookupError);
      return Response.json({ error: 'Failed to update agenda status' }, { status: 500 });
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: now };
    if (status !== undefined) {
      patch.status = status;
      patch.confirmed_at = status === 'confirmed' ? now : null;
    }
    if (isFavorite !== undefined) {
      patch.is_favorite = isFavorite;
    }

    if (existing) {
      const { error } = await supabase
        .from('user_agenda_status')
        .update(patch)
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('user_agenda_status')
        .insert({
          user_id: identity.registryUserId,
          event_id: eventId,
          agenda_id: agendaId,
          status: status ?? 'tentative',
          is_favorite: isFavorite ?? false,
          ...(status === 'confirmed' ? { confirmed_at: now } : {}),
        });
      if (error) throw error;
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('[agenda-status] update error:', error);
    return Response.json({ error: 'Failed to update agenda status' }, { status: 500 });
  }
}
