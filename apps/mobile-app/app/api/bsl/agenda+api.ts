import { getSupabaseServerForRequest } from '@/lib/supabase-server';

const EVENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;

/**
 * Compatibility adapter for clients released before agenda reads became
 * event-scoped. New callers must use `/api/events/:eventId/agenda`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const eventId = url.searchParams.get('eventId')?.trim().toLowerCase();

  if (!eventId || !EVENT_ID_PATTERN.test(eventId)) {
    return Response.json({ error: 'A valid event id is required' }, { status: 400 });
  }

  try {
    const { data, error } = await getSupabaseServerForRequest(request)
      .from('event_agenda')
      .select('*')
      .eq('event_id', eventId)
      .order('time', { ascending: true });
    if (error) throw error;

    return Response.json({ data: data || [] });
  } catch (error) {
    console.error('Legacy agenda compatibility fetch error:', error);
    return Response.json({ error: 'Failed to fetch agenda' }, { status: 500 });
  }
}
