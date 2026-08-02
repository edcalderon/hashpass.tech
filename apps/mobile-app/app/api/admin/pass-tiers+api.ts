import { rateLimitOk } from '@/lib/bsl/rateLimit';
import { authorizeEventAdmin } from '@/lib/server/event-admin';

const EVENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PASS_TYPES = new Set(['general', 'business', 'vip']);
const CURRENCY_PATTERN = /^[A-Za-z]{3}$/;

const parseNonNegativeInteger = (value: unknown): number | null => (
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
);

const getEventId = (request: Request) => new URL(request.url).searchParams.get('eventId')?.trim() || '';

export async function GET(request: Request) {
  const eventId = getEventId(request);
  if (!EVENT_ID_PATTERN.test(eventId)) {
    return Response.json({ error: 'A valid eventId is required' }, { status: 400 });
  }

  const authorization = await authorizeEventAdmin(request, eventId);
  if ('response' in authorization) return authorization.response;

  const { data, error } = await authorization.supabase
    .from('event_pass_tiers')
    .select('event_id, pass_type, max_meeting_requests, max_boost_amount, price_cents, currency, price_label, updated_at')
    .eq('event_id', eventId)
    .order('pass_type');
  if (error) {
    console.error('Unable to list event pass tiers:', error.message);
    return Response.json({ error: 'Unable to load pass tiers' }, { status: 500 });
  }

  return Response.json({ data: data || [] });
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimitOk(`admin-pass-tiers:${ip}`)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'A JSON body is required' }, { status: 400 });
  }

  const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
  const passType = typeof body.passType === 'string' ? body.passType : '';
  const maxMeetingRequests = parseNonNegativeInteger(body.maxMeetingRequests);
  const maxBoostAmount = parseNonNegativeInteger(body.maxBoostAmount);
  const priceCents = body.priceCents === null ? null : parseNonNegativeInteger(body.priceCents);
  const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : 'USD';
  const priceLabel = typeof body.priceLabel === 'string' ? body.priceLabel.trim() : null;

  if (!EVENT_ID_PATTERN.test(eventId) || !PASS_TYPES.has(passType)
    || maxMeetingRequests === null || maxBoostAmount === null
    || (body.priceCents !== null && priceCents === null)
    || !CURRENCY_PATTERN.test(currency)
    || (priceLabel !== null && priceLabel.length > 80)
    || (priceCents === null && !priceLabel)) {
    return Response.json({ error: 'Invalid pass tier settings' }, { status: 400 });
  }

  const authorization = await authorizeEventAdmin(request, eventId);
  if ('response' in authorization) return authorization.response;

  const { data, error } = await authorization.supabase.rpc('admin_update_event_pass_tier', {
    p_actor_user_id: authorization.userId,
    p_event_id: eventId,
    p_pass_type: passType,
    p_max_meeting_requests: maxMeetingRequests,
    p_max_boost_amount: maxBoostAmount,
    p_price_cents: priceCents,
    p_currency: currency,
    p_price_label: priceLabel || null,
  });
  if (error) {
    console.error('Unable to update event pass tier:', error.message);
    return Response.json({ error: 'Unable to update pass tier' }, { status: 500 });
  }

  return Response.json({ data });
}
