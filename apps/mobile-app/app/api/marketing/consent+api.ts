import { getSupabaseServerForRequest } from '../../../lib/supabase-server';
import { isResolveIdentityError, resolveNotificationIdentity } from '../../../lib/server/resolve-notification-identity';
import { SIGNUP_MARKETING_CONSENT_VERSION } from '../../../lib/marketing-consent-policy';

export async function POST(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return Response.json({ error: identity.error }, { status: identity.status, headers: { 'Cache-Control': 'private, no-store' } });
  }
  if (!identity.registryUserId || !identity.email) {
    return Response.json({ error: 'Linked account required' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
  }

  const body = await request.json().catch(() => null);
  if (
    body?.consentVersion !== SIGNUP_MARKETING_CONSENT_VERSION ||
    typeof body?.hashpassUpdates !== 'boolean' ||
    typeof body?.partnerPromotions !== 'boolean' ||
    (body.hashpassUpdates !== true && body.partnerPromotions !== true) ||
    typeof body?.requestId !== 'string' ||
    body.requestId.length < 3 ||
    body.requestId.length > 100
  ) {
    return Response.json({ error: 'Valid signup consent details are required' }, { status: 400, headers: { 'Cache-Control': 'private, no-store' } });
  }

  try {
    const { data, error } = await getSupabaseServerForRequest(request).rpc('record_signup_marketing_preferences', {
      p_user_id: identity.registryUserId,
      p_email: identity.email.trim().toLowerCase(),
      p_hashpass_updates: body.hashpassUpdates === true,
      p_partner_promotions: body.partnerPromotions === true,
      p_consent_version: body.consentVersion,
      p_request_id: body.requestId,
    });
    if (error) {
      console.error('[marketing/consent] opt-in record failed:', error.message);
      return Response.json({ error: 'Could not save email preferences' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
    }
    if (data !== true) {
      return Response.json({ error: 'Active account required to save email preferences' }, { status: 409, headers: { 'Cache-Control': 'private, no-store' } });
    }
    return Response.json({ success: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[marketing/consent] opt-in request failed:', error instanceof Error ? error.message : 'unknown error');
    return Response.json({ error: 'Could not save email preferences' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
