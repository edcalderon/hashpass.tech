import { getSupabaseServerForRequest } from '../../../lib/supabase-server';
import { isResolveIdentityError, resolveNotificationIdentity } from '../../../lib/server/resolve-notification-identity';
import { SIGNUP_MARKETING_CONSENT_VERSION } from '../../../lib/marketing-consent-policy';

const privateHeaders = { 'Cache-Control': 'private, no-store' };

async function resolvePreferenceIdentity(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return {
      response: Response.json({ error: identity.error }, { status: identity.status, headers: privateHeaders }),
    };
  }

  if (!identity.registryUserId || !identity.email) {
    return {
      response: Response.json({ error: 'Linked account required' }, { status: 403, headers: privateHeaders }),
    };
  }

  return { identity };
}

export async function GET(request: Request) {
  const resolved = await resolvePreferenceIdentity(request);
  if (resolved.response) return resolved.response;

  try {
    const supabase = getSupabaseServerForRequest(request);
    const params = {
      p_user_id: resolved.identity.registryUserId,
      p_email: resolved.identity.email.trim().toLowerCase(),
    };
    const [hashpassResult, partnerResult] = await Promise.all([
      supabase.rpc('get_marketing_email_preference', params),
      supabase.rpc('get_marketing_partner_preference', params),
    ]);

    if (hashpassResult.error || partnerResult.error) {
      console.error('[marketing/preferences] status lookup failed:', hashpassResult.error?.message ?? partnerResult.error?.message);
      return Response.json({ error: 'Could not load email preferences' }, { status: 503, headers: privateHeaders });
    }

    return Response.json({
      success: true,
      subscribed: hashpassResult.data === true,
      partnerSubscribed: partnerResult.data === true,
    }, { headers: privateHeaders });
  } catch (error) {
    console.error('[marketing/preferences] status request failed:', error instanceof Error ? error.message : 'unknown error');
    return Response.json({ error: 'Could not load email preferences' }, { status: 503, headers: privateHeaders });
  }
}

export async function POST(request: Request) {
  const resolved = await resolvePreferenceIdentity(request);
  if (resolved.response) return resolved.response;

  const body = await request.json().catch(() => null);
  if (
    typeof body?.subscribed !== 'boolean' ||
    (body?.preference !== undefined && !['hashpass_updates', 'partner_promotions'].includes(body.preference)) ||
    typeof body?.requestId !== 'string' ||
    body.requestId.length < 3 ||
    body.requestId.length > 100
  ) {
    return Response.json({ error: 'Valid email preference details are required' }, { status: 400, headers: privateHeaders });
  }

  try {
    const supabase = getSupabaseServerForRequest(request);
    const preference = body.preference ?? 'hashpass_updates';
    const rpcName = preference === 'partner_promotions'
      ? 'set_marketing_partner_preference'
      : 'set_marketing_email_preference';
    const { data, error } = await supabase.rpc(rpcName, {
      p_user_id: resolved.identity.registryUserId,
      p_email: resolved.identity.email.trim().toLowerCase(),
      p_subscribed: body.subscribed,
      p_consent_version: SIGNUP_MARKETING_CONSENT_VERSION,
      p_request_id: body.requestId,
      p_source: 'settings',
    });

    if (error) {
      console.error('[marketing/preferences] update failed:', error.message);
      return Response.json({ error: 'Could not save email preferences' }, { status: 503, headers: privateHeaders });
    }

    if (data === 'suppressed') {
      return Response.json({ error: 'Email address cannot be subscribed' }, { status: 409, headers: privateHeaders });
    }
    if (data === 'inactive') {
      return Response.json({ error: 'Active account required' }, { status: 403, headers: privateHeaders });
    }
    if (data === 'invalid') {
      return Response.json({ error: 'Valid email preference details are required' }, { status: 400, headers: privateHeaders });
    }
    if (data === 'request_conflict') {
      return Response.json({ error: 'Preference request has already been used' }, { status: 409, headers: privateHeaders });
    }
    if (data !== 'updated' && data !== 'unchanged') {
      return Response.json({ error: 'Could not save email preferences' }, { status: 503, headers: privateHeaders });
    }

    const [hashpassResult, partnerResult] = await Promise.all([
      supabase.rpc('get_marketing_email_preference', {
        p_user_id: resolved.identity.registryUserId,
        p_email: resolved.identity.email.trim().toLowerCase(),
      }),
      supabase.rpc('get_marketing_partner_preference', {
        p_user_id: resolved.identity.registryUserId,
        p_email: resolved.identity.email.trim().toLowerCase(),
      }),
    ]);
    if (hashpassResult.error || partnerResult.error) {
      console.error('[marketing/preferences] confirmation lookup failed:', hashpassResult.error?.message ?? partnerResult.error?.message);
      return Response.json({ error: 'Could not confirm email preferences' }, { status: 503, headers: privateHeaders });
    }

    return Response.json({
      success: true,
      subscribed: hashpassResult.data === true,
      partnerSubscribed: partnerResult.data === true,
    }, { headers: privateHeaders });
  } catch (error) {
    console.error('[marketing/preferences] update request failed:', error instanceof Error ? error.message : 'unknown error');
    return Response.json({ error: 'Could not save email preferences' }, { status: 503, headers: privateHeaders });
  }
}
