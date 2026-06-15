import { supabaseServer as supabase } from '@/lib/supabase-server';
import { rateLimitOk } from '@/lib/bsl/rateLimit';

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimitOk(`verify-ticket:${ip}`)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 });
  }
  const body = await request.json().catch(() => null);
  const ticketId = body?.ticketId || body?.token;
  const userId = body?.userId;
  if (!ticketId || !userId) {
    return new Response(JSON.stringify({ error: 'ticketId and userId are required' }), { status: 400 });
  }

  // Mock verification: mark as verified if ticket exists or create pending ticket
  const { data: existing } = await supabase
    .from('BSL_Tickets')
    .select('*')
    .eq('ticketId', ticketId)
    .maybeSingle();

  if (!existing) {
    const { error: insertError } = await supabase
      .from('BSL_Tickets')
      .insert({ ticketId, userId, verified: true, used: false, verifiedAt: new Date().toISOString() });
    if (insertError) {
      return new Response(JSON.stringify({ error: 'Failed to verify ticket' }), { status: 500 });
    }
    return new Response(JSON.stringify({ success: true, verified: true }), { status: 200 });
  }

  if (existing.userId && existing.userId !== userId) {
    return new Response(JSON.stringify({ error: 'Ticket belongs to another user' }), { status: 409 });
  }

  const { error } = await supabase
    .from('BSL_Tickets')
    .update({ userId, verified: true, verifiedAt: new Date().toISOString() })
    .eq('ticketId', ticketId);
  if (error) return new Response(JSON.stringify({ error: 'Failed to update ticket' }), { status: 500 });
  return new Response(JSON.stringify({ success: true, verified: true }), { status: 200 });
}


