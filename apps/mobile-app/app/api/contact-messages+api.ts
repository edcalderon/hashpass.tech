import { hasAuthenticatorAccess } from '../../lib/server/authenticator-api';
import { verifyStepUpProof } from '../../lib/server/pin-auth';
import type { MessagingSnapshot } from '../../types/contact-messaging';
import { getSupabaseServerForRequest } from '../../lib/supabase-server';
import { isResolveIdentityError, resolveNotificationIdentity } from '../../lib/server/resolve-notification-identity';
import { validMessagingAction } from '../../lib/contact-messaging';
import type { MessagingAction } from '../../types/contact-messaging';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
async function handle(request: Request, write = false) {
  try {
    const identity = await resolveNotificationIdentity(request);
    if (isResolveIdentityError(identity)) return reply({ error: identity.error }, identity.status);
    if (!identity.registryUserId) return reply({ error: 'A linked account is required' }, 403);
    let payload: MessagingAction | undefined;
    if (write) {
      let body: unknown;
      try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
      if (!validMessagingAction(body)) return reply({ error: 'Invalid message' }, 400);
      payload = body;
    }
    const unlocked = verifyStepUpProof(request.headers.get('X-Hashpass-Step-Up'), { userId: identity.registryUserId, scope: 'wallet:unlock' }) &&
      await hasAuthenticatorAccess(request, identity.registryUserId, ['access', 'critical']);
    if (write && !unlocked) return reply({ error: 'step_up_required' }, 403);
    const { data, error } = await getSupabaseServerForRequest(request).rpc('contact_messaging', {
      p_user_id: identity.registryUserId, p_action: payload?.action ?? 'read', p_payload: payload ?? {},
    });
    if (error) return reply({ error: error.code === '42501' ? 'A mutual connection is required.' : 'Messages are temporarily unavailable. Please try again.' }, error.code === '42501' ? 403 : error.code === 'P0001' ? 409 : 503);
    if (!write && !unlocked) {
      // The app-wide notification pill needs only names, avatars and pending state.
      // Conversation details stay behind the existing wallet security gate.
      const snapshot = data as MessagingSnapshot;
      return reply({ data: { self: snapshot.self, conversations: snapshot.conversations.map(item => ({
        id: item.id, name: item.name, avatar_url: item.avatar_url, needs_reply: item.needs_reply,
        role: '', company: '', handle: null, preview: null, updated_at: null,
      })) } });
    }
    return reply({ data });
  } catch { return reply({ error: 'Messages are temporarily unavailable. Please try again.' }, 503); }
}
export const GET = (request: Request) => handle(request);
export const POST = (request: Request) => handle(request, true);
