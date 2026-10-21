const mockIdentity = jest.fn();
const mockRpc = jest.fn();
jest.mock('../../lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: (...args: unknown[]) => mockIdentity(...args),
  isResolveIdentityError: (identity: { status?: number }) => typeof identity.status === 'number',
}));
jest.mock('../../lib/supabase-server', () => ({ getSupabaseServerForRequest: () => ({ rpc: mockRpc }) }));

import { GET, POST } from '../../app/api/contacts+api';
import { validContactsAction } from '../../lib/server/contacts-api';

const id = '00000000-0000-4000-8000-000000000001';
const profile = { name: 'Ari', role: 'Builder', company: '', topics: ['AI'], discoverable: false, leaderboard: false };
const post = (body: unknown, suffix = '') => POST(new Request(`https://api.hashpass.tech/api/contacts${suffix}`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }));

describe('Contacts API boundary', () => {
  beforeEach(() => { jest.clearAllMocks(); mockIdentity.mockResolvedValue({ registryUserId: id }); mockRpc.mockResolvedValue({ data: { profile: null, contacts: [] }, error: null }); });
  it('requires authentication before reading any contacts', async () => {
    mockIdentity.mockResolvedValue({ error: 'Unauthorized', status: 401 });
    const response = await GET(new Request('https://api.hashpass.tech/api/contacts'));
    expect(response.status).toBe(401); expect(mockRpc).not.toHaveBeenCalled();
  });
  it('uses the verified registry identity, ignoring a forged actor in the body', async () => {
    const response = await post({ action: 'profile', profile, userId: 'another-user' });
    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('contact_network', expect.objectContaining({ p_user_id: id, p_action: 'profile' }));
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });
  it('preserves the shared card when creating a profile from an invitation', async () => {
    await post({ action: 'profile', profile }, `?card=${id}`);
    expect(mockRpc).toHaveBeenCalledWith('contact_network', expect.objectContaining({ p_payload: expect.objectContaining({ card: id }) }));
  });
  it.each([
    { action: 'profile', profile: { ...profile, topics: ['AI', 'AI'] } },
    { action: 'profile', profile: { ...profile, topics: ['unknown'] } },
    { action: 'profile', profile: { ...profile, name: ' ' } },
    { action: 'profile', profile: { ...profile, leaderboard: 'true' } },
    { action: 'profile', profile: { ...profile, topics: ['AI', 'Web3', 'Design', 'Startups', 'Payments', 'Gaming'] } },
    { action: 'accept', requestId: 'invalid' }, { action: 'awardPoints', points: 999999 },
  ])('rejects invalid profile/actions without touching storage: %j', async body => {
    expect(validContactsAction(body)).toBe(false);
    expect((await post(body)).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it('does not reveal SQL details on an unavailable backend', async () => {
    mockRpc.mockResolvedValue({ error: { code: '42P01', message: 'private database details' } });
    const response = await GET(new Request('https://api.hashpass.tech/api/contacts'));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('private database details');
  });
  it('rejects unlinked accounts and malformed card links', async () => {
    mockIdentity.mockResolvedValue({ registryUserId: null });
    expect((await GET(new Request('https://api.hashpass.tech/api/contacts'))).status).toBe(403);
    mockIdentity.mockResolvedValue({ registryUserId: id });
    expect((await GET(new Request('https://api.hashpass.tech/api/contacts?card=invalid'))).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
