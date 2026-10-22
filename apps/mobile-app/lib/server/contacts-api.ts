import { getSupabaseServerForRequest } from '../supabase-server';
import { isResolveIdentityError, resolveNotificationIdentity } from './resolve-notification-identity';
import { CONTACT_TOPICS, MAX_CONTACT_TOPICS } from '../contacts';
import type { ContactsAction } from '../../types/contacts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie' };
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: privateHeaders });

export function validContactsAction(value: unknown): value is ContactsAction {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  if (body.action === 'request') return typeof body.card === 'string' && uuid.test(body.card);
  if (['accept', 'decline', 'cancel'].includes(String(body.action))) return typeof body.requestId === 'string' && uuid.test(body.requestId);
  if (body.action !== 'profile' || !body.profile || typeof body.profile !== 'object') return false;
  const profile = body.profile as Record<string, unknown>;
  return typeof profile.name === 'string' && profile.name.trim().length > 0 && profile.name.length <= 80 &&
    typeof profile.role === 'string' && profile.role.length <= 100 &&
    typeof profile.company === 'string' && profile.company.length <= 100 &&
    typeof profile.discoverable === 'boolean' && typeof profile.leaderboard === 'boolean' &&
    (profile.identity_mode === undefined || profile.identity_mode === 'attendee' || profile.identity_mode === 'speaker') &&
    Array.isArray(profile.topics) && profile.topics.length <= MAX_CONTACT_TOPICS && new Set(profile.topics).size === profile.topics.length &&
    profile.topics.every(topic => CONTACT_TOPICS.some((allowed: string) => allowed === topic));
}

export async function contactsRequest(request: Request, write = false) {
  try {
    const identity = await resolveNotificationIdentity(request);
    if (isResolveIdentityError(identity)) return reply({ error: identity.error }, identity.status);
    if (!identity.registryUserId) return reply({ error: 'A linked account is required' }, 403);
    const card = new URL(request.url).searchParams.get('card');
    if (card && !uuid.test(card)) return reply({ error: 'Invalid contact card' }, 400);
    let payload: unknown = {};
    if (write) {
      try { payload = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
      if (!validContactsAction(payload)) return reply({ error: 'Invalid contacts action' }, 400);
    }
    const { data, error } = await getSupabaseServerForRequest(request).rpc('contact_network', {
      p_user_id: identity.registryUserId,
      p_action: write ? (payload as ContactsAction).action : 'read',
      p_payload: write ? { ...payload as ContactsAction, ...((payload as ContactsAction).action !== 'request' && card ? { card } : {}) } : { card },
    });
    if (error) {
      console.error('[contacts] contact_network rpc error:', { code: error.code, message: error.message });
      const status = error.code === 'P0001' ? 409 : error.code === '42501' ? 403 : 503;
      return reply({ error: status === 409 ? 'This request is no longer available. Refresh your network.' : 'Contacts are temporarily unavailable. Please try again.' }, status);
    }
    return reply({ data });
  } catch {
    return reply({ error: 'Contacts are temporarily unavailable. Please try again.' }, 503);
  }
}
