import { getSupabaseServerForRequest } from '../supabase-server';
import { isResolveIdentityError, resolveNotificationIdentity } from './resolve-notification-identity';
import { CONTACT_TOPICS, MAX_CONTACT_TOPICS } from '../contacts';
import { SETUP_GOALS, MAX_SETUP_GOALS } from '../setup';
import { derivePinVerifier, isStepUpScope, issueStepUpProof, PIN_PATTERN } from './pin-auth';
import type { PinOutcome, SetupPatch } from '../../types/setup';

const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: privateHeaders });
const failure = (error: string, status: number) => reply({ success: false, error }, status);

const PATCH_KEYS = ['step', 'goals', 'topics', 'privacyScope', 'consentVersion', 'complete'];
const unique = (values: unknown[]) => new Set(values).size === values.length;

export function validSetupPatch(value: unknown): value is SetupPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const patch = value as Record<string, unknown>;
  if (Object.keys(patch).some(key => !PATCH_KEYS.includes(key))) return false;
  if ('step' in patch && !(Number.isInteger(patch.step) && (patch.step as number) >= 0 && (patch.step as number) <= 3)) return false;
  if ('goals' in patch && !(Array.isArray(patch.goals) && patch.goals.length <= MAX_SETUP_GOALS && unique(patch.goals) &&
    patch.goals.every(goal => (SETUP_GOALS as readonly unknown[]).includes(goal)))) return false;
  if ('topics' in patch && !(Array.isArray(patch.topics) && patch.topics.length <= MAX_CONTACT_TOPICS && unique(patch.topics) &&
    patch.topics.every(topic => (CONTACT_TOPICS as readonly unknown[]).includes(topic)))) return false;
  if ('privacyScope' in patch && patch.privacyScope !== 'private' && patch.privacyScope !== 'public') return false;
  if ('consentVersion' in patch && !(Number.isInteger(patch.consentVersion) && (patch.consentVersion as number) > 0 && (patch.consentVersion as number) < 1000)) return false;
  if ('complete' in patch && typeof patch.complete !== 'boolean') return false;
  return true;
}

async function boundedJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new Error();
  const text = await request.text();
  if (text.length > 4096) throw new Error();
  const body = JSON.parse(text);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
  return body;
}

// Reads may use cookies; mutations need a bearer token so a cross-site request
// cannot ride ambient cookies. Same rule as the wallet enrollment route.
async function actor(request: Request, write: boolean): Promise<{ response: Response } | { userId: string }> {
  if (write && !/^Bearer\s+\S+$/i.test(request.headers.get('Authorization') ?? '')) return { response: failure('bearer_required', 401) };
  const headers = new Headers(request.headers);
  if (write) headers.delete('Cookie');
  const identity = await resolveNotificationIdentity(write ? new Request(request.url, { headers }) : request);
  if (isResolveIdentityError(identity)) return { response: failure(identity.error, identity.status) };
  if (!identity.registryUserId) return { response: failure('A linked account is required', 403) };
  return { userId: identity.registryUserId };
}

const databaseFailure = (code?: string) => code === '23514' ? failure('invalid_request', 400) : failure('unavailable', 503);

export async function setupRequest(request: Request, write = false) {
  try {
    const who = await actor(request, write);
    if ('response' in who) return who.response;
    let patch: SetupPatch = {};
    if (write) {
      try { patch = await boundedJson(request) as SetupPatch; } catch { return failure('invalid_request', 400); }
      if (!validSetupPatch(patch)) return failure('invalid_request', 400);
    }
    const db = getSupabaseServerForRequest(request);
    const { data, error } = write
      ? await db.rpc('save_user_setup', { p_user_id: who.userId, p_patch: patch })
      : await db.rpc('get_user_setup', { p_user_id: who.userId });
    if (error) return databaseFailure(error.code);
    return reply({ success: true, data });
  } catch { return failure('unavailable', 503); }
}

const toOutcome = (row: any): PinOutcome => ({
  ok: row?.ok === true, enabled: row?.enabled === true,
  remainingAttempts: Number(row?.remainingAttempts ?? 0), lockedUntil: row?.lockedUntil ?? null,
});

/**
 * POST { action: 'set', pin, currentPin? }       create or change the PIN
 * POST { action: 'verify', pin, scope }          check it and mint a scoped proof
 *
 * A wrong PIN is a valid answer, not an error: it returns 200 with ok:false and the
 * remaining attempts, so clients can show them and the counter has already been
 * committed server-side. Missing or malformed input never reaches the database.
 */
export async function pinRequest(request: Request) {
  try {
    const who = await actor(request, true);
    if ('response' in who) return who.response;
    let body: Record<string, unknown>;
    try { body = await boundedJson(request); } catch { return failure('invalid_request', 400); }
    const db = getSupabaseServerForRequest(request);

    if (body.action === 'set') {
      const current = body.currentPin;
      if (typeof body.pin !== 'string' || !PIN_PATTERN.test(body.pin) || (current !== undefined && (typeof current !== 'string' || !PIN_PATTERN.test(current)))) return failure('invalid_request', 400);
      if (Object.keys(body).some(key => !['action', 'pin', 'currentPin'].includes(key))) return failure('invalid_request', 400);
      const { data, error } = await db.rpc('set_user_pin', {
        p_user_id: who.userId,
        p_verifier: derivePinVerifier(who.userId, body.pin),
        p_current: current === undefined ? null : derivePinVerifier(who.userId, current as string),
      });
      if (error) return error.code === '23514' ? failure('pin_already_set', 409) : failure('unavailable', 503);
      return reply({ success: true, data: toOutcome(data) });
    }

    if (body.action === 'verify') {
      if (typeof body.pin !== 'string' || !PIN_PATTERN.test(body.pin) || !isStepUpScope(body.scope)) return failure('invalid_request', 400);
      if (Object.keys(body).some(key => !['action', 'pin', 'scope'].includes(key))) return failure('invalid_request', 400);
      const { data, error } = await db.rpc('verify_user_pin', { p_user_id: who.userId, p_candidate: derivePinVerifier(who.userId, body.pin) });
      if (error) return databaseFailure(error.code);
      const outcome = toOutcome(data);
      return reply({ success: true, data: outcome.ok ? { ...outcome, proof: issueStepUpProof(who.userId, body.scope) } : outcome });
    }
    return failure('invalid_request', 400);
  } catch {
    // A missing pepper (PinConfigurationError) must not look like a wrong PIN or leak why.
    return failure('unavailable', 503);
  }
}
