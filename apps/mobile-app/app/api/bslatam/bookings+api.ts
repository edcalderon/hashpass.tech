import { supabaseServer as supabase } from '@/lib/supabase-server';
import { validateBookingInput } from '@/lib/bsl/validation';
import { rateLimitOk } from '@/lib/bsl/rateLimit';
import { sendBookingEmail } from '@/lib/email';

function badRequest(message: string) {
  return new Response(JSON.stringify({ error: message }), { status: 400, headers: { 'Content-Type': 'application/json' } });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user');
  if (!userId) return badRequest('Missing user');

  const { data, error } = await supabase
    .from('BSL_Bookings')
    .select('*')
    .eq('attendeeId', userId)
    .order('start', { ascending: true });
  if (error) return new Response(JSON.stringify({ error: 'Failed to fetch bookings' }), { status: 500 });
  return new Response(JSON.stringify({ data: data || [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    if (!rateLimitOk(`post-booking:${ip}`)) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 });
    }
    const body = await request.json();
    const { speakerId, attendeeId, start, end } = body || {};
    const validationError = validateBookingInput({ speakerId, attendeeId, start, end });
    if (validationError) return badRequest(validationError);

    // Verify ticket
    const { data: ticket } = await supabase
      .from('BSL_Tickets')
      .select('ticketId, verified, used, userId')
      .eq('userId', attendeeId)
      .eq('verified', true)
      .maybeSingle();
    if (!ticket) return new Response(JSON.stringify({ error: 'Ticket not verified' }), { status: 403 });

    // Prevent double booking per speaker+start
    const { data: existing } = await supabase
      .from('BSL_Bookings')
      .select('id')
      .eq('speakerId', speakerId)
      .eq('start', start)
      .maybeSingle();
    if (existing) return badRequest('Slot already booked');

    const { data, error } = await supabase
      .from('BSL_Bookings')
      .insert({ speakerId, attendeeId, start, end, status: 'requested' })
      .select('*')
      .maybeSingle();
    if (error) return new Response(JSON.stringify({ error: 'Failed to create booking' }), { status: 500 });
    // Fire-and-forget email notifications (sandbox safe)
    try { await sendBookingEmail('sandbox@example.com', 'requested', { start }); } catch {}
    try { await supabase.from('BSL_Audit').insert({ event: 'booking_created', ref_id: data?.id, actor: attendeeId, metadata: { speakerId, start } }); } catch {}
    return new Response(JSON.stringify({ data }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }
}


