import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import { rateLimitOk } from '@/lib/bsl/rateLimit';
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from '@/lib/server/resolve-notification-identity';

const EXPO_TOKEN_PATTERN = /^(Expo|Exponent)PushToken\[[^\]\s]+\]$/;
const PLATFORMS = new Set(['ios', 'android', 'web']);
const WEB_PUSH_HOSTS = new Set([
  'fcm.googleapis.com',
  'web.push.apple.com',
  'updates.push.services.mozilla.com',
]);

async function getIdentity(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return { response: Response.json({ error: identity.error }, { status: identity.status }) } as const;
  }
  if (!identity.supabaseUserId) {
    return { response: Response.json({ error: 'A linked app account is required for push notifications' }, { status: 403 }) } as const;
  }
  return { identity } as const;
}

/** Read the signed-in account's push opt-in state without exposing device tokens. */
export async function GET(request: Request) {
  const auth = await getIdentity(request);
  if ('response' in auth) return auth.response;
  const supabase = getSupabaseServerForRequest(request);
  const { count, error } = await supabase
    .from('notification_push_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', auth.identity.supabaseUserId)
    .eq('enabled', true);
  if (error) {
    console.error('[notification-push-token] status query failed:', error.message);
    return Response.json({ error: 'Unable to read push notification settings' }, { status: 500 });
  }
  return Response.json({
    enabledDeviceCount: count || 0,
    webPushPublicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY &&
      process.env.WEB_PUSH_VAPID_PRIVATE_KEY && process.env.WEB_PUSH_VAPID_SUBJECT
      ? process.env.WEB_PUSH_VAPID_PUBLIC_KEY
      : null,
  });
}

/** Register a user-approved Expo device token. */
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimitOk(`notification-push-token:${ip}`)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }
  const auth = await getIdentity(request);
  if ('response' in auth) return auth.response;
  const parsedBody = await request.json().catch(() => ({}));
  const body = parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)
    ? parsedBody as Record<string, unknown>
    : {};
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const platform = typeof body.platform === 'string' ? body.platform.trim() : '';
  let subscription: Record<string, unknown> | null = null;
  if (platform === 'web') {
    const value = body.subscription;
    const keys = value && typeof value === 'object' ? (value as Record<string, unknown>).keys : null;
    const endpoint = value && typeof value === 'object' ? (value as Record<string, unknown>).endpoint : null;
    const keyValues = keys && typeof keys === 'object' ? keys as Record<string, unknown> : null;
    const p256dh = keyValues?.p256dh;
    const authSecret = keyValues?.auth;
    let secureEndpoint = false;
    try {
      if (typeof endpoint === 'string' && endpoint.length <= 2048) {
        const parsed = new URL(endpoint);
        secureEndpoint = parsed.protocol === 'https:' && (
          WEB_PUSH_HOSTS.has(parsed.hostname) || parsed.hostname.endsWith('.notify.windows.com')
        );
      }
    } catch {
      secureEndpoint = false;
    }
    if (
      !secureEndpoint || token !== endpoint || !keyValues ||
      typeof p256dh !== 'string' || p256dh.length > 256 ||
      typeof authSecret !== 'string' || authSecret.length > 128
    ) {
      return Response.json({ error: 'A valid browser push subscription is required' }, { status: 400 });
    }
    subscription = value as Record<string, unknown>;
  } else if (!EXPO_TOKEN_PATTERN.test(token)) {
    return Response.json({ error: 'A valid Expo push token is required' }, { status: 400 });
  }
  if (!PLATFORMS.has(platform)) {
    return Response.json({ error: 'A supported push platform is required' }, { status: 400 });
  }

  const supabase = getSupabaseServerForRequest(request);
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('notification_push_tokens')
    .upsert({
      user_id: auth.identity.supabaseUserId,
      token,
      platform,
      subscription,
      enabled: true,
      updated_at: now,
      last_seen_at: now,
    }, { onConflict: 'token' });
  if (error) {
    console.error('[notification-push-token] token registration failed:', error.message);
    return Response.json({ error: 'Unable to register this device for push notifications' }, { status: 500 });
  }
  return Response.json({ success: true });
}

/** Disable push delivery for every device linked to this account. */
export async function DELETE(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimitOk(`notification-push-token:${ip}`)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }
  const auth = await getIdentity(request);
  if ('response' in auth) return auth.response;
  const supabase = getSupabaseServerForRequest(request);
  const { error } = await supabase
    .from('notification_push_tokens')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq('user_id', auth.identity.supabaseUserId)
    .eq('enabled', true);
  if (error) {
    console.error('[notification-push-token] opt-out failed:', error.message);
    return Response.json({ error: 'Unable to update push notification settings' }, { status: 500 });
  }
  return Response.json({ success: true, enabledDeviceCount: 0 });
}
