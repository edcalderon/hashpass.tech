import { rateLimitOk } from '@/lib/bsl/rateLimit';
import { sendMeetingNotificationEmail } from '@/lib/email';
import { authorizeEventAdmin, listEventAttendees } from '@/lib/server/event-admin';

const value = (x: unknown, n = 200) => String(x || '').trim().slice(0, n);

export async function GET(request: Request) {
  const eventId = value(new URL(request.url).searchParams.get('eventId'), 64);
  const auth = await authorizeEventAdmin(request, eventId);
  if ('response' in auth) return auth.response;
  try {
    const [attendees, speakers, runs] = await Promise.all([
      listEventAttendees(auth.supabase, auth.userId, eventId),
      auth.supabase.from('bsl_speakers').select('id, user_id, name, title, company').eq('is_active', true).eq('is_accepting_meetings', true).not('user_id', 'is', null).order('name'),
      auth.supabase.from('admin_matchmaking_runs').select('*').eq('event_id', eventId).order('created_at', { ascending: false }).limit(20),
    ]);
    if (speakers.error) return Response.json({ error: 'Unable to load matchmaking candidates' }, { status: 500 });
    return Response.json({ data: { users: attendees, speakers: speakers.data || [], runs: runs.data || [] } });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Unable to load matchmaking candidates' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimitOk(`admin-matchmaking:${ip}`)) return Response.json({ error: 'Too many requests' }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const eventId = value(body.eventId, 64), mode = body.mode === 'random' ? 'random' : 'manual';
  const auth = await authorizeEventAdmin(request, eventId);
  if ('response' in auth) return auth.response;

  let attendees: Awaited<ReturnType<typeof listEventAttendees>>;
  try {
    attendees = await listEventAttendees(auth.supabase, auth.userId, eventId);
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Unable to load event attendees' }, { status: 500 });
  }
  const attendeesById = new Map(attendees.map(a => [a.id, a]));

  const { data: speakerRows } = await auth.supabase.from('bsl_speakers').select('id, user_id, name').eq('is_active', true).eq('is_accepting_meetings', true).not('user_id', 'is', null);
  const speakers = new Map((speakerRows || []).map((s: any) => [String(s.id), s]));

  let pairs: { userId: string; speakerId: string }[] = [];
  if (mode === 'manual') {
    pairs = Array.isArray(body.pairs) ? body.pairs.slice(0, 100) : [];
  } else {
    const count = Math.min(Math.max(Number(body.count) || 1, 1), 100);
    const shuffled = [...attendees].sort(() => Math.random() - .5);
    const speakerList = [...speakers.values()];
    pairs = shuffled.slice(0, count).map((u, i) => ({ userId: u.id, speakerId: (speakerList[i % Math.max(speakerList.length, 1)] as any)?.id })).filter(p => p.speakerId);
  }

  const message = value(body.message, 1000) || 'You were matched by the event team.';
  const created: any[] = [], failures: any[] = [];
  for (const pair of pairs) {
    const speaker: any = speakers.get(value(pair.speakerId));
    const attendee = attendeesById.get(value(pair.userId));
    if (!attendee) { failures.push({ pair, error: 'User is not registered for this event' }); continue; }
    if (!speaker || attendee.id === speaker.user_id) { failures.push({ pair, error: 'Invalid participant pair' }); continue; }

    const requesterName = attendee.name || attendee.email.split('@')[0];
    const { data, error } = await auth.supabase.rpc('insert_meeting_request', {
      p_requester_id: attendee.id,
      p_speaker_id: String(speaker.id),
      p_speaker_name: speaker.name,
      p_requester_name: requesterName,
      p_requester_company: null,
      p_requester_title: null,
      p_requester_ticket_type: attendee.ticketType || 'general',
      p_meeting_type: 'networking',
      p_message: message,
      p_duration_minutes: 15,
      p_event_id: eventId,
    });
    if (error) { failures.push({ pair, error: error.message }); continue; }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.id) { failures.push({ pair, error: 'Meeting request rejected' }); continue; }
    created.push(result);

    await Promise.all([
      sendMeetingNotificationEmail({ recipientUserId: attendee.id, recipientRole: 'requester', status: 'requested', eventId, requesterName, speakerName: speaker.name, message }),
      sendMeetingNotificationEmail({ recipientUserId: speaker.user_id, recipientRole: 'speaker', status: 'requested', eventId, requesterName, speakerName: speaker.name, message }),
    ]);
  }
  await auth.supabase.from('admin_matchmaking_runs').insert({ event_id: eventId, created_by: auth.userId, mode, requested_count: pairs.length, created_count: created.length, status: failures.length ? 'partial' : 'completed' });
  return Response.json({ data: { created, failures } }, { status: created.length ? 200 : 422 });
}
