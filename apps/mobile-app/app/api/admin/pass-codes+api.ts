import { rateLimitOk } from '@/lib/bsl/rateLimit';
import { authorizeEventAdmin } from '@/lib/server/event-admin';

const EVENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{5,127}$/;
const PASS_TYPES = new Set(['general', 'business', 'vip']);
const ACTIONS = new Set(['create', 'deactivate', 'reactivate']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeCode = (value: string) => value.trim().toUpperCase();

const generateCode = (eventId: string) =>
  `${eventId.toUpperCase()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

/**
 * GET /api/admin/pass-codes?eventId=... — list code metadata for an event.
 * Hashes and raw values are deliberately excluded: an administrator only sees
 * a custom value at creation time, then retains the operational label/status.
 */
export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimitOk(`admin-pass-codes:${ip}`)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const eventId = (searchParams.get('eventId') || '').trim();
  if (!EVENT_ID_PATTERN.test(eventId)) {
    return Response.json({ error: 'A valid eventId is required' }, { status: 400 });
  }

  const authorization = await authorizeEventAdmin(request, eventId);
  if ('response' in authorization) return authorization.response;

  const { data, error } = await authorization.supabase
    .from('pass_claim_codes')
    .select('id, event_id, label, pass_type, max_claims, claimed_count, expires_at, is_active, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('Failed to list pass claim codes:', error.message);
    if (error.code === '42P01') {
      return Response.json(
        { error: 'Pass-code storage is not installed yet. Apply the BSL database migrations and try again.' },
        { status: 503 },
      );
    }
    return Response.json({ error: 'Unable to list pass codes' }, { status: 500 });
  }

  return Response.json({ data: data || [] });
}

/**
 * POST /api/admin/pass-codes — create, deactivate, or reactivate an event
 * code. Create returns the raw value once; only its SHA-256 hash is stored.
 */
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimitOk(`admin-pass-codes:${ip}`)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'A JSON body is required' }, { status: 400 });
  }

  const action = typeof body.action === 'string' ? body.action : '';
  const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
  const passType = typeof body.passType === 'string' ? body.passType : '';
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  const codeId = typeof body.codeId === 'string' ? body.codeId.trim() : null;
  const expiresAt = typeof body.expiresAt === 'string' && body.expiresAt.trim() ? body.expiresAt : null;
  const maxClaims = body.maxClaims === null || body.maxClaims === undefined ? null : body.maxClaims;

  if (!ACTIONS.has(action) || !EVENT_ID_PATTERN.test(eventId)) {
    return Response.json({ error: 'A valid action and eventId are required' }, { status: 400 });
  }
  if (action !== 'create' && (!codeId || !UUID_PATTERN.test(codeId))) {
    return Response.json({ error: 'A valid codeId is required' }, { status: 400 });
  }

  let code: string | null = null;
  if (action === 'create') {
    code = normalizeCode(typeof body.code === 'string' && body.code.trim() ? body.code : generateCode(eventId));
    if (!CODE_PATTERN.test(code) || !PASS_TYPES.has(passType) || !label || label.length > 160) {
      return Response.json({ error: 'A valid code, label, and pass type are required' }, { status: 400 });
    }
    if (maxClaims !== null && (!Number.isInteger(maxClaims) || (maxClaims as number) < 1)) {
      return Response.json({ error: 'maxClaims must be a positive integer or null for unlimited use' }, { status: 400 });
    }
    if (expiresAt !== null && Number.isNaN(Date.parse(expiresAt))) {
      return Response.json({ error: 'expiresAt must be a valid date string' }, { status: 400 });
    }
  }

  const authorization = await authorizeEventAdmin(request, eventId);
  if ('response' in authorization) return authorization.response;

  const { data, error } = await authorization.supabase.rpc('admin_manage_event_pass_claim_code', {
    p_actor_user_id: authorization.userId,
    p_event_id: eventId,
    p_action: action,
    p_code: code,
    p_label: action === 'create' ? label : null,
    p_pass_type: action === 'create' ? passType : null,
    p_max_claims: action === 'create' ? maxClaims : null,
    p_expires_at: action === 'create' ? expiresAt : null,
    p_code_id: codeId,
  });

  if (error) {
    console.error('Administrative pass-code mutation failed:', error.message);
    const status = error.code === '42501' ? 403 : error.code === '22023' || error.code === '23505' ? 400 : 500;
    return Response.json(
      { error: status === 403 ? 'Forbidden' : status === 400 ? error.message : 'Unable to update pass code' },
      { status },
    );
  }

  return Response.json({ data, ...(action === 'create' ? { code } : {}) });
}
