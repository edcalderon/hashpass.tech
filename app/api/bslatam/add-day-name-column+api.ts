import { supabaseServer as supabase } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    // Add the day_name column
    const { error: alterError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE public.event_agenda ADD COLUMN IF NOT EXISTS day_name TEXT;'
    });

    if (alterError) {
      console.error('Error adding column:', alterError);
      return new Response(JSON.stringify({ 
        error: 'Failed to add day_name column',
        details: alterError.message 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Add comment
    await supabase.rpc('exec_sql', {
      sql: "COMMENT ON COLUMN public.event_agenda.day_name IS 'Thematic name for the day';"
    });

    // Create index
    await supabase.rpc('exec_sql', {
      sql: 'CREATE INDEX IF NOT EXISTS idx_event_agenda_day_name ON public.event_agenda(day_name);'
    });

    return new Response(JSON.stringify({
      success: true,
      message: 'day_name column added successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('API error:', e);
    return new Response(JSON.stringify({ 
      error: 'Unexpected server error',
      details: e instanceof Error ? e.message : 'Unknown error'
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
