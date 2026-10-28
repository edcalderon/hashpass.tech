import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import { eventIdFromRequest, isEventSectionPublic } from '@/lib/server/event-api';
import { resolveNotificationIdentity, isResolveIdentityError } from '@/lib/server/resolve-notification-identity';
import { createCorsPreflightResponse, getCorsHeaders } from '@/lib/cors';

const corsOptions = {
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
} as const;

const responseHeaders = (request: Request) => {
  return {
    'Content-Type': 'application/json',
    ...getCorsHeaders(request, corsOptions),
  };
};

export async function OPTIONS(request?: Request) {
  return createCorsPreflightResponse(request, corsOptions);
}

export async function GET(request: Request) {
  const supabase = getSupabaseServerForRequest(request);
  const eventId = eventIdFromRequest(request);
  if (!eventId) {
    return new Response(JSON.stringify({ error: 'A valid event id is required' }), {
      status: 400,
      headers: responseHeaders(request),
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
          headers: responseHeaders(request),
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
        headers: responseHeaders(request),
      });
    }

    return new Response(JSON.stringify({
      data: data || []
    }), { 
      status: 200, 
      headers: responseHeaders(request),
    });
  } catch (e) {
    console.error('Agenda API error:', e);
    return new Response(JSON.stringify({ error: 'Unexpected server error' }), { 
      status: 500,
      headers: responseHeaders(request),
    });
  }
}
