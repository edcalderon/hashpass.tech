import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import { eventIdFromRequest } from '@/lib/server/event-api';

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
