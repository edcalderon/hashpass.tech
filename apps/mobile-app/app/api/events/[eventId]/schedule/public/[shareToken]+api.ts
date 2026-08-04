import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import { eventIdFromRequest } from '@/lib/server/event-api';

// GET /api/events/:eventId/schedule/public/:shareToken — deliberately
// unauthenticated. shareToken is the only credential: it resolves to a
// user_id via user_schedule_shares (RLS-protected against direct client
// reads; this route uses the server's service-role client, same pattern as
// every other app/api/**/+api.ts route in this app -- see
// lib/supabase-server.ts), then returns that user's *confirmed* sessions
// for this event joined against event_agenda. Nothing more sensitive than
// this event's own already-public agenda content is exposed.
export async function GET(request: Request) {
  const eventId = eventIdFromRequest(request);
  if (!eventId) {
    return Response.json({ error: 'A valid event id is required' }, { status: 400 });
  }

  const url = new URL(request.url);
  const shareToken = url.pathname.split('/').filter(Boolean).pop();
  if (!shareToken) {
    return Response.json({ error: 'A share token is required' }, { status: 400 });
  }

  const supabase = getSupabaseServerForRequest(request);
  try {
    const { data: share, error: shareError } = await supabase
      .from('user_schedule_shares')
      .select('user_id')
      .eq('share_token', shareToken)
      .eq('event_id', eventId)
      .maybeSingle();
    if (shareError) throw shareError;
    if (!share) {
      return Response.json({ error: 'This share link is invalid or has expired' }, { status: 404 });
    }

    const { data: statuses, error: statusError } = await supabase
      .from('user_agenda_status')
      .select('agenda_id, status')
      .eq('user_id', share.user_id)
      .eq('event_id', eventId)
      .eq('status', 'confirmed')
      .not('agenda_id', 'is', null);
    if (statusError) throw statusError;

    const confirmedIds = (statuses || []).map((s: { agenda_id: string | null }) => s.agenda_id).filter(Boolean);
    if (confirmedIds.length === 0) {
      return Response.json({ data: [] });
    }

    const { data: items, error: agendaError } = await supabase
      .from('event_agenda')
      .select('id, time, title, speakers, type, location, day, day_name')
      .eq('event_id', eventId)
      .in('id', confirmedIds)
      .order('time', { ascending: true });
    if (agendaError) throw agendaError;

    return Response.json({ data: items || [] });
  } catch (error) {
    console.error('[schedule-public] error:', error);
    return Response.json({ error: 'Failed to load shared schedule' }, { status: 500 });
  }
}
