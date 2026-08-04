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

    let { data: profile } = await supabase
      .from('user_profiles')
      .select('full_name')
      .eq('user_id', share.user_id)
      .maybeSingle();
    if (!profile) {
      const { data: registry } = await (supabase as any)
        .from('user')
        .select('provider_ids')
        .eq('id', share.user_id)
        .maybeSingle();
      const supabaseUserId = registry?.provider_ids?.supabase;
      if (supabaseUserId) {
        const result = await supabase.from('user_profiles').select('full_name').eq('user_id', supabaseUserId).maybeSingle();
        profile = result.data;
      }
    }
    const fullName = typeof profile?.full_name === 'string' ? profile.full_name.trim() : '';
    const ownerHandle = fullName
      ? `@${fullName.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '').slice(0, 32)}`
      : '@hashpass.attendee';

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
      return Response.json({ data: [], owner: ownerHandle });
    }

    const { data: items, error: agendaError } = await supabase
      .from('event_agenda')
      .select('id, time, title, speakers, type, location, day, day_name')
      .eq('event_id', eventId)
      .in('id', confirmedIds)
      .order('time', { ascending: true });
    if (agendaError) throw agendaError;

    return Response.json({ data: items || [], owner: ownerHandle });
  } catch (error) {
    console.error('[schedule-public] error:', error);
    return Response.json({ error: 'Failed to load shared schedule' }, { status: 500 });
  }
}
