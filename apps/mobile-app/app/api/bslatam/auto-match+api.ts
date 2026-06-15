import { supabaseServer as supabase } from '@/lib/supabase-server';
import { rateLimitOk } from '@/lib/bsl/rateLimit';

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimitOk(`auto-match:${ip}`)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 });
  }
  const body = await request.json().catch(() => null);
  const { attendeeId, interests = [] } = body || {};
  if (!attendeeId) return new Response(JSON.stringify({ error: 'attendeeId required' }), { status: 400 });

  // Simple heuristic: pick first speaker that shares a tag
  const { data: speakers, error } = await supabase.from('bsl_speakers').select('id, name, tags, availability');
  if (error) return new Response(JSON.stringify({ error: 'Failed to load speakers' }), { status: 500 });
  const normalized = (x: string) => x.toLowerCase();
  const match = (speakers || []).find(s => (s.tags || []).some((t: string) => interests.map(normalized).includes(normalized(t))));
  if (!match) return new Response(JSON.stringify({ message: 'No suitable match found' }), { status: 200 });
  return new Response(JSON.stringify({ speakerId: match.id }), { status: 200 });
}


