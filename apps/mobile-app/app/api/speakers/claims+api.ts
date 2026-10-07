import { rateLimitOk } from '@/lib/bsl/rateLimit';
import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from '@/lib/server/resolve-notification-identity';

const SPEAKER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/i;
const MAX_NOTE_LENGTH = 1000;

async function authenticatedIdentity(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) return { response: identity.response };
  if (!identity.supabaseUserId) {
    return {
      response: Response.json({ error: 'Authentication required' }, { status: 401 }),
    };
  }
  return { userId: identity.supabaseUserId };
}

function requestRateLimitKey(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function mapClaimError(error: { code?: string; message?: string }) {
  if (error.code === '42501') return { status: 403, message: 'This speaker profile cannot be claimed.' };
  if (error.code === '23505') return { status: 409, message: 'A claim already exists for this speaker profile.' };
  if (error.code === '22023') return { status: 400, message: error.message || 'The claim request is invalid.' };
  return { status: 500, message: 'Unable to submit the speaker claim request.' };
}

export async function POST(request: Request) {
  if (!rateLimitOk(`speaker-claim:${requestRateLimitKey(request)}`)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  const auth = await authenticatedIdentity(request);
  if ('response' in auth) return auth.response;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const speakerId = typeof body?.speakerId === 'string' ? body.speakerId.trim() : '';
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  if (!SPEAKER_ID_PATTERN.test(speakerId)) {
    return Response.json({ error: 'A valid speakerId is required' }, { status: 400 });
  }
  if (note.length > MAX_NOTE_LENGTH) {
    return Response.json({ error: 'The claim note is too long' }, { status: 400 });
  }

  const { data, error } = await getSupabaseServerForRequest(request).rpc('request_speaker_profile_claim', {
    p_speaker_id: speakerId,
    p_requester_user_id: auth.userId,
    p_note: note || null,
  });
  if (error) {
    console.error('Speaker claim request failed:', error.message);
    const mapped = mapClaimError(error);
    return Response.json({ error: mapped.message }, { status: mapped.status });
  }

  return Response.json({ data });
}
