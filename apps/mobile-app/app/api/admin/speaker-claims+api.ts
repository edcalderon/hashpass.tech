import { rateLimitOk } from '@/lib/bsl/rateLimit';
import { authorizeEventAdmin } from '@/lib/server/event-admin';

const EVENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const CLAIM_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVIEW_ACTIONS = new Set(['approve', 'reject']);
const MAX_REVIEW_NOTE_LENGTH = 1000;

function requestRateLimitKey(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function mapReviewError(error: { code?: string; message?: string }) {
  if (error.code === '42501') return { status: 403, message: 'Forbidden' };
  if (error.code === '40400' || error.code === '22023') return { status: 400, message: error.message || 'The claim request is invalid.' };
  if (error.code === '23505') return { status: 409, message: error.message || 'The speaker profile is already linked.' };
  return { status: 500, message: 'Unable to review the speaker claim.' };
}

export async function GET(request: Request) {
  if (!rateLimitOk(`admin-speaker-claims:${requestRateLimitKey(request)}`)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  const eventId = (new URL(request.url).searchParams.get('eventId') || '').trim();
  if (!EVENT_ID_PATTERN.test(eventId)) {
    return Response.json({ error: 'A valid eventId is required' }, { status: 400 });
  }

  const authorization = await authorizeEventAdmin(request, eventId);
  if ('response' in authorization) return authorization.response;

  const { data, error } = await authorization.supabase.rpc('list_speaker_claim_requests', {
    p_actor_user_id: authorization.userId,
    p_event_id: eventId,
  });
  if (error) {
    console.error('Failed to list speaker claim requests:', error.message);
    const mapped = mapReviewError(error);
    return Response.json({ error: mapped.message }, { status: mapped.status });
  }
  return Response.json({ data: data || [] });
}

export async function POST(request: Request) {
  if (!rateLimitOk(`admin-speaker-claims:${requestRateLimitKey(request)}`)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : '';
  const claimId = typeof body?.claimId === 'string' ? body.claimId.trim() : '';
  const action = typeof body?.action === 'string' ? body.action : '';
  const reviewNote = typeof body?.reviewNote === 'string' ? body.reviewNote.trim() : '';
  if (!EVENT_ID_PATTERN.test(eventId) || !CLAIM_ID_PATTERN.test(claimId) || !REVIEW_ACTIONS.has(action)) {
    return Response.json({ error: 'A valid eventId, claimId, and review action are required' }, { status: 400 });
  }
  if (reviewNote.length > MAX_REVIEW_NOTE_LENGTH) {
    return Response.json({ error: 'The review note is too long' }, { status: 400 });
  }

  const authorization = await authorizeEventAdmin(request, eventId);
  if ('response' in authorization) return authorization.response;

  const { data, error } = await authorization.supabase.rpc('review_speaker_profile_claim', {
    p_actor_user_id: authorization.userId,
    p_claim_id: claimId,
    p_action: action,
    p_review_note: reviewNote || null,
  });
  if (error) {
    console.error('Speaker claim review failed:', error.message);
    const mapped = mapReviewError(error);
    return Response.json({ error: mapped.message }, { status: mapped.status });
  }
  return Response.json({ data });
}
