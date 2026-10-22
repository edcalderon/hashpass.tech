import { rateLimitOk } from '@/lib/bsl/rateLimit';
import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from '@/lib/server/resolve-notification-identity';
import { getEventSupabaseProfileId } from '@/lib/server/event-supabase-profile';
import { normalizeMagicLinkRedirect } from '@/lib/auth/magic-link-request';
import type { SpeakerClaimResult } from '@/types/speaker-claim.types';
import { sendAuthenticationMagicLink, sendCriticalNotificationEmail } from '@/lib/email';

const SPEAKER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/i;
const EVENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NOTE_LENGTH = 1000;
const MIN_NOTE_LENGTH = 20;
const CLAIM_MODES = new Set(['current_email', 'other_email']);

async function authenticatedIdentity(request: Request, profileId?: string) {
  const identity = await resolveNotificationIdentity(request, profileId);
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
  if (error.code === '23505') return { status: 409, message: error.message || 'A claim already exists for this speaker profile.' };
  if (error.code === '22023') return { status: 400, message: error.message || 'The claim request is invalid.' };
  return { status: 500, message: 'Unable to submit the speaker claim request.' };
}

/** True while V132 has not been applied to the target database. */
const isMissingFunction = (error: { code?: string } | null | undefined) =>
  error?.code === 'PGRST202' || error?.code === '42883';

/**
 * Emails every reviewer who was just notified in-app. The in-app notification
 * is already persisted by the database; email is the escalation so an event
 * administrator does not have to be looking at the dashboard.
 */
async function emailReviewers(eventId: string, claim: SpeakerClaimResult, claimantEmail: string | null) {
  const reviewers = Array.isArray(claim.reviewer_ids) ? claim.reviewer_ids : [];
  if (!claim.created || reviewers.length === 0) return;

  const speaker = claim.speaker_name || 'a speaker profile';
  const email = claim.claim_email || claimantEmail || 'an unverified account';
  const message = `${email} asks to be linked to ${speaker}. Their note: ${(claim.request_note || '').slice(0, 600)}`;
  await Promise.allSettled(reviewers.map((recipientUserId) => sendCriticalNotificationEmail({
    recipientUserId,
    title: 'Speaker profile claim to review',
    message,
    notificationType: 'speaker_claim_review_required',
    speakerName: claim.speaker_name,
    eventId,
    actionUrl: 'https://bsl.hashpass.tech/dashboard/admin',
    actionLabel: 'Review claim',
  })));
}

/** Delivers an already-minted single-use sign-in link to the claimed email. */
async function sendVerificationLink(
  email: string,
  redirectTo: string,
  locale: string,
  tokenHash: string,
  verificationType: string | undefined,
) {
  // Same hash-fragment delivery as /api/auth/magic-link: mail scanners that
  // prefetch the URL never run the client JS that consumes the token.
  const url = new URL(redirectTo);
  url.hash = `token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(verificationType || 'magiclink')}`;
  const delivery = await sendAuthenticationMagicLink({ email, actionLink: url.toString(), locale });
  return delivery.success ? {} : { error: 'Could not send the verification email' as const };
}

export async function POST(request: Request) {
  if (!rateLimitOk(`speaker-claim:${requestRateLimitKey(request)}`)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const eventId = typeof body?.eventId === 'string' ? body.eventId.trim().toLowerCase() : '';
  if (!EVENT_ID_PATTERN.test(eventId)) {
    return Response.json({ error: 'A valid eventId is required' }, { status: 400 });
  }
  const bslProfile = getEventSupabaseProfileId(request, eventId);
  const scopedAuth = await authenticatedIdentity(request, bslProfile);
  if ('response' in scopedAuth) return scopedAuth.response;

  const speakerId = typeof body?.speakerId === 'string' ? body.speakerId.trim() : '';
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  const mode = typeof body?.mode === 'string' ? body.mode : 'current_email';
  const claimEmail = typeof body?.claimEmail === 'string' ? body.claimEmail.trim().toLowerCase() : '';
  if (!SPEAKER_ID_PATTERN.test(speakerId)) {
    return Response.json({ error: 'A valid speakerId is required' }, { status: 400 });
  }
  if (!CLAIM_MODES.has(mode)) {
    return Response.json({ error: 'Unsupported claim mode' }, { status: 400 });
  }
  if (note.length > MAX_NOTE_LENGTH) {
    return Response.json({ error: 'The claim note is too long' }, { status: 400 });
  }
  const supabase = getSupabaseServerForRequest(request, bslProfile);

  // Verify the inbox first, then (and only then) the claim becomes reviewable.
  if (mode === 'other_email') {
    if (note.length < MIN_NOTE_LENGTH) {
      return Response.json({ error: 'Explain why this email belongs to the speaker (at least 20 characters)' }, { status: 400 });
    }
    if (!EMAIL_PATTERN.test(claimEmail)) {
      return Response.json({ error: 'A valid email is required' }, { status: 400 });
    }
    const redirectTo = normalizeMagicLinkRedirect(body?.redirectTo);
    if (!redirectTo) {
      return Response.json({ error: 'Invalid verification callback' }, { status: 400 });
    }
    if (!rateLimitOk(`speaker-claim-email:${claimEmail}`)) {
      return Response.json({ error: 'Please wait before requesting another link' }, { status: 429 });
    }
    const locale = typeof body?.locale === 'string' ? body.locale.slice(0, 8) : 'en';

    // generateLink creates the unconfirmed account for a new address and never
    // confirms it: ownership is proven only when the inbox owner opens the link.
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: claimEmail,
      options: { redirectTo, data: { locale } },
    });
    const claimantUserId = linkData?.user?.id;
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !claimantUserId || !tokenHash) {
      console.error('Speaker claim account setup failed:', linkError?.message);
      return Response.json({ error: 'Could not start email verification' }, { status: 502 });
    }

    const { data, error } = await supabase.rpc('submit_speaker_profile_claim', {
      p_speaker_id: speakerId,
      p_submitted_by: scopedAuth.userId,
      p_claimant_user_id: claimantUserId,
      p_claim_mode: 'other_email',
      p_claim_email: claimEmail,
      p_note: note,
    });
    if (error) {
      console.error('Speaker claim request failed:', error.message);
      const mapped = isMissingFunction(error)
        ? { status: 503, message: 'Speaker claims with another email are not available yet.' }
        : mapClaimError(error);
      return Response.json({ error: mapped.message }, { status: mapped.status });
    }

    const claim = data as SpeakerClaimResult;
    if (claim.verification_status === 'pending') {
      // Always send: a repeat submit is the user asking for a fresh link.
      const sent = await sendVerificationLink(
        claimEmail, redirectTo, locale, tokenHash, linkData?.properties?.verification_type,
      );
      if ('error' in sent) {
        return Response.json({ error: sent.error }, { status: 502 });
      }
    }
    return Response.json({ data });
  }

  if (note.length < MIN_NOTE_LENGTH) {
    return Response.json({ error: 'Explain why this email belongs to the speaker (at least 20 characters)' }, { status: 400 });
  }
  const { data, error } = await supabase.rpc('submit_speaker_profile_claim', {
    p_speaker_id: speakerId,
    p_submitted_by: scopedAuth.userId,
    p_claimant_user_id: scopedAuth.userId,
    p_claim_mode: 'current_email',
    p_claim_email: null,
    p_note: note,
  });
  if (error) {
    console.error('Speaker claim request failed:', error.message);
    const mapped = mapClaimError(error);
    return Response.json({ error: mapped.message }, { status: mapped.status });
  }

  await emailReviewers(eventId, data as SpeakerClaimResult, null);
  return Response.json({ data });
}

/**
 * Called once the owner of the claimed email has signed in through the
 * verification link. Marks the claim verified and alerts the reviewers.
 */
export async function PATCH(request: Request) {
  if (!rateLimitOk(`speaker-claim-verify:${requestRateLimitKey(request)}`)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const eventId = typeof body?.eventId === 'string' ? body.eventId.trim().toLowerCase() : '';
  const speakerId = typeof body?.speakerId === 'string' ? body.speakerId.trim() : '';
  if (!EVENT_ID_PATTERN.test(eventId) || !SPEAKER_ID_PATTERN.test(speakerId)) {
    return Response.json({ error: 'A valid eventId and speakerId are required' }, { status: 400 });
  }
  const bslProfile = getEventSupabaseProfileId(request, eventId);
  const scopedAuth = await authenticatedIdentity(request, bslProfile);
  if ('response' in scopedAuth) return scopedAuth.response;

  const { data, error } = await getSupabaseServerForRequest(request, bslProfile).rpc('verify_speaker_claim_email', {
    p_speaker_id: speakerId,
    p_user_id: scopedAuth.userId,
  });
  if (error) {
    console.error('Speaker claim verification failed:', error.message);
    const mapped = mapClaimError(error);
    return Response.json({ error: mapped.message }, { status: mapped.status });
  }

  await emailReviewers(eventId, data as SpeakerClaimResult, null);
  return Response.json({ data });
}
