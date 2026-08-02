import { rateLimitOk } from '@/lib/bsl/rateLimit';
import { authorizeEventAdmin } from '@/lib/server/event-admin';

const EVENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SPEAKER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACTIONS = new Set(['grant', 'revoke', 'activate', 'deactivate']);

type SpeakerClaim = {
  speaker_id: string;
  email_normalized: string;
  status: 'unclaimed' | 'claimed' | 'needs_review';
  claimed_user_id: string | null;
  claim_error: string | null;
};

/**
 * GET /api/admin/speaker-roles?eventId=... — list the tenant speaker
 * directory plus the safe, private claim metadata needed by event admins.
 */
export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimitOk(`admin-speaker-roles:${ip}`)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  const eventId = (new URL(request.url).searchParams.get('eventId') || '').trim();
  if (!EVENT_ID_PATTERN.test(eventId)) {
    return Response.json({ error: 'A valid eventId is required' }, { status: 400 });
  }

  const authorization = await authorizeEventAdmin(request, eventId);
  if ('response' in authorization) return authorization.response;

  const { data: speakers, error: speakersError } = await authorization.supabase
    .from('bsl_speakers')
    .select('id, name, title, company, imageurl, user_id, is_active, is_accepting_meetings')
    .order('name')
    .limit(500);
  if (speakersError) {
    console.error('Failed to list speaker assignments:', speakersError.message);
    return Response.json({ error: 'Unable to list speakers' }, { status: 500 });
  }

  const speakerIds = (speakers || []).map((speaker: { id: string }) => String(speaker.id));
  const claimsBySpeakerId = new Map<string, SpeakerClaim>();
  if (speakerIds.length) {
    const { data: claims, error: claimsError } = await authorization.supabase
      .from('speaker_identity_claims')
      .select('speaker_id, email_normalized, status, claimed_user_id, claim_error')
      .in('speaker_id', speakerIds);
    if (claimsError) {
      console.error('Failed to list speaker claims:', claimsError.message);
      return Response.json({ error: 'Unable to list speaker assignments' }, { status: 500 });
    }
    for (const claim of (claims || []) as SpeakerClaim[]) claimsBySpeakerId.set(claim.speaker_id, claim);
  }

  return Response.json({
    data: (speakers || []).map((speaker: any) => ({
      id: String(speaker.id),
      name: speaker.name,
      title: speaker.title || null,
      company: speaker.company || null,
      imageUrl: speaker.imageurl || null,
      userId: speaker.user_id || null,
      isActive: Boolean(speaker.is_active && speaker.user_id),
      isAcceptingMeetings: Boolean(speaker.is_accepting_meetings),
      claim: claimsBySpeakerId.get(String(speaker.id)) || null,
    })),
  });
}

/**
 * POST /api/admin/speaker-roles — grant/revoke a speaker account assignment
 * or toggle its active availability. The database RPC repeats authorization
 * and records the operation in the event audit log.
 */
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimitOk(`admin-speaker-roles:${ip}`)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: 'A JSON body is required' }, { status: 400 });

  const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
  const speakerId = typeof body.speakerId === 'string' ? body.speakerId.trim() : '';
  const action = typeof body.action === 'string' ? body.action : '';
  const targetEmail = typeof body.targetEmail === 'string' ? body.targetEmail.trim().toLowerCase() : null;
  if (!EVENT_ID_PATTERN.test(eventId) || !SPEAKER_ID_PATTERN.test(speakerId) || !ACTIONS.has(action)) {
    return Response.json({ error: 'A valid eventId, speakerId, and action are required' }, { status: 400 });
  }
  if (action === 'grant' && (!targetEmail || targetEmail.length > 320 || !EMAIL_PATTERN.test(targetEmail))) {
    return Response.json({ error: 'A valid existing account email is required to grant speaker access' }, { status: 400 });
  }

  const authorization = await authorizeEventAdmin(request, eventId);
  if ('response' in authorization) return authorization.response;

  const { data, error } = await authorization.supabase.rpc('admin_manage_speaker_role', {
    p_actor_user_id: authorization.userId,
    p_event_id: eventId,
    p_action: action,
    p_speaker_id: speakerId,
    p_target_email: action === 'grant' ? targetEmail : null,
  });
  if (error) {
    console.error('Speaker role mutation failed:', error.message);
    const status = error.code === '42501' ? 403 : error.code === '23505' ? 409 : error.code === '22023' ? 400 : 500;
    return Response.json(
      { error: status === 403 ? 'Forbidden' : status === 500 ? 'Unable to update speaker access' : error.message },
      { status },
    );
  }

  return Response.json({ data });
}
