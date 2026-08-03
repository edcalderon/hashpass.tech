import { rateLimitOk } from '@/lib/bsl/rateLimit';
import { sendMeetingNotificationEmail } from '@/lib/email';
import { authorizeEventAdmin } from '@/lib/server/event-admin';

const value = (x: unknown, n = 200) => String(x || '').trim().slice(0, n);

export async function GET(request: Request) {
  const eventId = value(new URL(request.url).searchParams.get('eventId'), 64);
  const auth = await authorizeEventAdmin(request, eventId);
  if ('response' in auth) return auth.response;
  const [users, speakers, runs] = await Promise.all([
    auth.supabase.rpc('admin_search_active_users', { p_actor_user_id: auth.userId, p_event_id: eventId, p_query: '', p_limit: 500, p_cursor: null }),
    auth.supabase.from('bsl_speakers').select('id, user_id, name, title, company').eq('is_active', true).eq('is_accepting_meetings', true).not('user_id', 'is', null).order('name'),
    auth.supabase.from('admin_matchmaking_runs').select('*').eq('event_id', eventId).order('created_at', { ascending: false }).limit(20),
  ]);
  if (users.error || speakers.error) return Response.json({ error: 'Unable to load matchmaking candidates' }, { status: 500 });
  return Response.json({ data: { users: users.data || [], speakers: speakers.data || [], runs: runs.data || [] } });
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimitOk(`admin-matchmaking:${ip}`)) return Response.json({ error: 'Too many requests' }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const eventId = value(body.eventId, 64), mode = body.mode === 'random' ? 'random' : 'manual';
  const auth = await authorizeEventAdmin(request, eventId);
  if ('response' in auth) return auth.response;
  const { data: speakerRows } = await auth.supabase.from('bsl_speakers').select('id, user_id, name').eq('is_active', true).eq('is_accepting_meetings', true).not('user_id', 'is', null);
  let pairs: { userId: string; speakerId: string }[] = [];
  if (mode === 'manual') pairs = Array.isArray(body.pairs) ? body.pairs.slice(0, 100) : [];
  else {
    const count = Math.min(Math.max(Number(body.count) || 1, 1), 100);
    const { data: userRows } = await auth.supabase.rpc('admin_search_active_users', { p_actor_user_id: auth.userId, p_event_id: eventId, p_query: '', p_limit: 500, p_cursor: null });
    const shuffled = [...(userRows || [])].sort(() => Math.random() - .5);
    pairs = shuffled.slice(0, count).map((u: any, i: number) => ({ userId: u.id, speakerId: (speakerRows || [])[i % Math.max((speakerRows || []).length, 1)]?.id })).filter(p => p.speakerId);
  }
  const speakers = new Map((speakerRows || []).map((s: any) => [String(s.id), s]));
  const created: any[] = [], failures: any[] = [];
  for (const pair of pairs) {
    const speaker: any = speakers.get(value(pair.speakerId));
    if (!speaker || pair.userId === speaker.user_id) { failures.push({ pair, error: 'Invalid participant pair' }); continue; }
    const user = await auth.supabase.auth.admin.getUserById(value(pair.userId));
    const requesterName = user.data.user?.user_metadata?.name || user.data.user?.email?.split('@')[0] || 'Attendee';
    const { data, error } = await auth.supabase.from('meeting_requests').insert({ event_id: eventId, requester_id: pair.userId, speaker_id: speaker.user_id, requester_name: requesterName, speaker_name: speaker.name, status: 'requested', meeting_type: 'networking', message: value(body.message, 1000) || 'You were matched by the event team.', duration_minutes: 15 }).select().single();
    if (error) { failures.push({ pair, error: error.message }); continue; }
    created.push(data);
    const notificationRows = [pair.userId, speaker.user_id].map(userId => ({ user_id: userId, type: 'meeting_match', title: 'New event match', message: `${requesterName} ↔ ${speaker.name}`, data: { eventId, meetingRequestId: data.id }, is_read: false }));
    await auth.supabase.from('notifications').insert(notificationRows);
    await Promise.all([
      sendMeetingNotificationEmail({ recipientUserId: pair.userId, recipientRole: 'requester', status: 'requested', eventId, requesterName, speakerName: speaker.name, message: data.message }),
      sendMeetingNotificationEmail({ recipientUserId: speaker.user_id, recipientRole: 'speaker', status: 'requested', eventId, requesterName, speakerName: speaker.name, message: data.message }),
    ]);
  }
  await auth.supabase.from('admin_matchmaking_runs').insert({ event_id: eventId, created_by: auth.userId, mode, requested_count: pairs.length, created_count: created.length, status: failures.length ? 'partial' : 'completed' });
  return Response.json({ data: { created, failures } }, { status: created.length ? 200 : 422 });
}
