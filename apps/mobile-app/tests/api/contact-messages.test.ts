let mockUnlocked = true;
let mockFactor = true;
jest.mock('../../lib/server/pin-auth', () => ({ verifyStepUpProof: () => mockUnlocked }));
jest.mock('../../lib/server/authenticator-api', () => ({ hasAuthenticatorAccess: async () => mockFactor }));
const mockIdentity = jest.fn();
const mockRpc = jest.fn();
jest.mock('../../lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: (...args: unknown[]) => mockIdentity(...args),
  isResolveIdentityError: (identity: { status?: number }) => typeof identity.status === 'number',
}));
jest.mock('../../lib/supabase-server', () => ({ getSupabaseServerForRequest: () => ({ rpc: mockRpc }) }));
import { GET, POST } from '../../app/api/contact-messages+api';
import { normalizeContactHandle, pendingConversations, validMessagingAction } from '../../lib/contact-messaging';
import { validContactsAction } from '../../lib/server/contacts-api';
const id = '00000000-0000-4000-8000-000000000001';
const peer = '00000000-0000-4000-8000-000000000002';
const post = (body: unknown) => POST(new Request('https://api.hashpass.tech/api/contact-messages', { method: 'POST', body: JSON.stringify(body) }));
beforeEach(() => { jest.clearAllMocks(); mockUnlocked = true; mockFactor = true; mockIdentity.mockResolvedValue({ registryUserId: id }); mockRpc.mockResolvedValue({ data: { messages: [] }, error: null }); });
it('requires a verified and linked account before touching messages', async () => {
  mockIdentity.mockResolvedValue({ error: 'Unauthorized', status: 401 });
  expect((await GET(new Request('https://api.hashpass.tech/api/contact-messages'))).status).toBe(401);
  mockIdentity.mockResolvedValue({ registryUserId: null });
  expect((await post({ action: 'thread', peer })).status).toBe(403);
  expect(mockRpc).not.toHaveBeenCalled();
});
it('always uses the verified actor and prevents response caching', async () => {
  const result = await post({ action: 'send', peer, id, body: 'Hello', p_user_id: peer });
  expect(result.status).toBe(200);
  expect(result.headers.get('Cache-Control')).toContain('no-store');
  expect(mockRpc).toHaveBeenCalledWith('contact_messaging', expect.objectContaining({ p_user_id: id, p_action: 'send' }));
});
it.each([
  { action: 'send', peer, id, body: '   ' }, { action: 'send', peer, id, body: 'x'.repeat(4001) },
  { action: 'send', peer, id: 'bad', body: 'Hi' }, { action: 'thread', peer: 'bad' },
  { action: 'thread', peer, before: '-1' }, { action: 'thread', peer, before: '9223372036854775808' },
  { action: 'read', peer },
])('rejects malformed requests before storage: %j', async body => {
  expect(validMessagingAction(body)).toBe(false);
  expect((await post(body)).status).toBe(400); expect(mockRpc).not.toHaveBeenCalled();
});
it('supports bounded history pagination', async () => {
  expect((await post({ action: 'thread', peer, before: '50' })).status).toBe(200);
  expect(mockRpc).toHaveBeenCalledWith('contact_messaging', expect.objectContaining({ p_payload: { action: 'thread', peer, before: '50' } }));
});
it('returns a safe denial for users outside a mutual connection', async () => {
  mockRpc.mockResolvedValue({ error: { code: '42501', message: 'private table detail' } });
  const result = await post({ action: 'thread', peer });
  expect(result.status).toBe(403); expect(JSON.stringify(await result.json())).not.toContain('private table detail');
});
it('only accepts an exact normalized handle, never partial searches', () => {
  expect(normalizeContactHandle(' @Ari_01 ')).toBe('ari_01');
  expect(validContactsAction({ action: 'request_handle', handle: 'ari_01' })).toBe(true);
  for (const handle of ['ar', 'Ari_01', 'ari%', 'ari*', 'ari name', '@ari', 'x'.repeat(31)]) expect(validContactsAction({ action: 'request_handle', handle })).toBe(false);
});
it('only floats conversations that need a response', () => {
  const incoming = { id, name: 'Ari', role: '', company: '', handle: 'ari', preview: 'Hello', updated_at: null, needs_reply: true };
  const replied = { ...incoming, id: peer, needs_reply: false };
  expect(pendingConversations([incoming, replied])).toEqual([incoming]);
  expect(pendingConversations([replied])).toEqual([]);
});

it('keeps message history and sends behind the wallet PIN and authenticator gate', async () => {
  mockUnlocked = false;
  expect((await post({ action: 'thread', peer })).status).toBe(403);
  expect((await post({ action: 'send', peer, id, body: 'Hello' })).status).toBe(403);
  mockUnlocked = true; mockFactor = false;
  expect((await post({ action: 'thread', peer })).status).toBe(403);
  expect(mockRpc).not.toHaveBeenCalled();
});
it('limits locked-wallet notifications to profile previews and pending state', async () => {
  mockUnlocked = false;
  mockRpc.mockResolvedValue({ data: { self: id, conversations: [{ id: peer, name: 'Robin', avatar_url: 'avatar.png', needs_reply: true, preview: 'Private message', role: 'Private role', company: 'Private company', handle: 'private_handle' }] }, error: null });
  const response = await GET(new Request('https://api.hashpass.tech/api/contact-messages'));
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.data.conversations[0]).toEqual(expect.objectContaining({ name: 'Robin', needs_reply: true, preview: null, handle: null, role: '', company: '' }));
  expect(JSON.stringify(data)).not.toContain('Private');
});
