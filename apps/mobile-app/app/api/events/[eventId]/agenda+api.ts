import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import { eventIdFromRequest, isEventSectionPublic } from '@/lib/server/event-api';
import { resolveNotificationIdentity, isResolveIdentityError } from '@/lib/server/resolve-notification-identity';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders
  });
}

export async function GET(request: Request) {
  const supabase = getSupabaseServerForRequest(request);
  const eventId = eventIdFromRequest(request);
  if (!eventId) {
    return new Response(JSON.stringify({ error: 'A valid event id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    // event_agenda's own RLS policy is `USING (true)` -- wide open -- and
    // this route runs on the service-role client anyway (bypasses RLS), so
    // the organizer's agenda_public toggle has to be enforced here.
    const agendaPublic = await isEventSectionPublic(supabase, eventId, 'agenda_public');
    if (!agendaPublic) {
      // The flag gates unauthenticated/guest visibility only (db/migrations/V109)
      // -- a signed-in attendee must still see a private event's real agenda via
      // the same dashboard links that already route them here regardless of the
      // flag, so only deny the request once we've confirmed the caller has no
      // session at all.
      const identity = await resolveNotificationIdentity(request);
      if (isResolveIdentityError(identity)) {
        // `public: false` lets the client tell "hidden" apart from a genuinely
        // empty/not-yet-live agenda -- without it, agenda.tsx's empty-response
        // handling falls back to the event's bundled static schedule, which
        // would defeat this gate entirely.
        return new Response(JSON.stringify({ data: [], public: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    const { data, error } = await supabase
      .from('event_agenda')
      .select('*')
      .eq('event_id', eventId)
      .order('time', { ascending: true });

    if (error) {
      console.error('Agenda fetch error:', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch agenda' }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        }
      });
    }

    return new Response(JSON.stringify({
      data: data || []
    }), { 
      status: 200, 
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      } 
    });
  } catch (e) {
    console.error('Agenda API error:', e);
    return new Response(JSON.stringify({ error: 'Unexpected server error' }), { 
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      }
    });
  }
}
