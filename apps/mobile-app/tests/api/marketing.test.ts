import pack from '../../config/marketing/bsl2026.json';

const mockIdentity = jest.fn();
const mockRoles = jest.fn();
const mockRpc = jest.fn();
const mockReady = jest.fn();
jest.mock('../../lib/server/resolve-notification-identity', () => ({ resolveNotificationIdentity: (...args: unknown[]) => mockIdentity(...args), isResolveIdentityError: (value: Record<string, unknown>) => 'error' in value }));
jest.mock('../../lib/supabase-server', () => ({ getSupabaseServerForRequest: () => ({ rpc: (...args: unknown[]) => mockRpc(...args), from: () => ({ select: () => ({ eq: () => ({ in: () => mockRoles() }) }) }) }) }));
jest.mock('../../lib/email', () => ({ marketingSenderReady: () => mockReady() }));
import { GET as overview, POST as admin } from '../../app/api/admin/marketing+api';
import { GET as unsubscribePage, POST as unsubscribe } from '../../app/api/marketing/unsubscribe+api';
import { POST as activity } from '../../app/api/marketing/activity+api';

const actor = '00000000-0000-4000-8000-000000000001';
const req = (body: unknown, path = 'admin/marketing') => new Request(`https://api.hashpass.tech/api/${path}`, { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => {
  jest.clearAllMocks();
  mockIdentity.mockResolvedValue({ supabaseUserId: actor, registryUserId: 'registry-user' });
  mockRoles.mockResolvedValue({ data: [{ role: 'admin', expires_at: null }], error: null });
  mockRpc.mockResolvedValue({ data: {}, error: null }); mockReady.mockResolvedValue(true);
});
describe('global campaign administration', () => {
  it.each([{ error: 'Sign in', status: 401 }, { registryUserId: actor }])('rejects identities without global administrative auth: %j', async identity => {
    mockIdentity.mockResolvedValue(identity);
    expect((await overview(req({}))).status).toBe('status' in identity ? identity.status : 403);
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it.each([{roles: []}, {roles: [{ role: 'event_admin', expires_at: null }]}, {roles: [{ role: 'super_admin', expires_at: '2020-01-01T00:00:00Z' }]}])('does not give event or expired roles platform campaign access', async ({roles}) => {
    mockRoles.mockResolvedValue({ data: roles, error: null });
    expect((await admin(req({ action: 'seed' }))).status).toBe(403);
  });
  it('fails closed on role lookup failure', async () => {
    mockRoles.mockResolvedValue({ data: null, error: {} }); expect((await overview(req({}))).status).toBe(503);
  });
  it('merges private overview and activity without cache', async () => {
    mockRpc.mockImplementation(async (name: string) => ({ error: null, data: name === 'marketing_overview' ? { campaigns: [] } : { activity: { points: 5 } } }));
    const response = await overview(req({})); expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(await response.json()).toEqual({ data: { campaigns: [], activity: { points: 5 } } });
  });
  it('reports unavailable storage', async () => {
    mockRpc.mockResolvedValue({ error: {} }); expect((await overview(req({}))).status).toBe(503);
  });
  it('previews escaped content in the requested locale and event without sending', async () => {
    const response = await admin(req({ action: 'preview', copy: pack.messages[0].content.en, locale: 'en', eventId: 'colombia2026' }));
    const body = await response.json(); expect(body.data.html).toContain('BSL COLOMBIA 2026'); expect(body.data.html).toContain('Unsubscribe'); expect(mockRpc).not.toHaveBeenCalled();
  });
  it.each([{ action: 'preview', copy: {} }, { action: 'save', draft: {} }, { action: 'schedule', id: 'bad' }, { action: 'unsupported' }, null])('rejects invalid input %j', async body => expect((await admin(req(body))).status).toBe(400));
  it('seeds only the canonical pack and resolves the actor from the session', async () => {
    expect((await admin(req({ action: 'seed', actor: 'attacker', campaigns: [] }))).status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('marketing_campaign_action', { p_actor: actor, p_action: 'seed', p_payload: { campaigns: pack.messages } });
  });
  it('validates custom drafts and forwards lifecycle conflicts', async () => {
    const draft = { ...pack.messages[0], readiness: {} };
    expect((await admin(req({ action: 'save', draft }))).status).toBe(200);
    mockRpc.mockResolvedValue({ error: { code: 'P0001' } });
    expect((await admin(req({ action: 'pause', id: actor }))).status).toBe(409);
    mockRpc.mockResolvedValue({ error: { code: 'OTHER' } });
    expect((await admin(req({ action: 'cancel', id: actor }))).status).toBe(503);
  });
  it('cannot activate without a configured sender', async () => {
    mockReady.mockResolvedValue(false);
    expect((await admin(req({ action: 'schedule', id: actor }))).status).toBe(503); expect(mockRpc).not.toHaveBeenCalled();
  });
  it.each(['not-a-time', '2999-01-01T00:00:00Z', '2026-10-22T09:00'])('requires an explicit past snapshot cutoff: %s', async cutoff => expect((await admin(req({ action: 'snapshot', cutoff }))).status).toBe(400));
  it('prepares a canonical sorted SHA-256 manifest and returns only RPC metadata', async () => {
    mockRpc.mockImplementation(async (name: string) => ({ error: null, data: name === 'marketing_snapshot_preview' ? [{ user_id: 'b', interactions: 2, provisional_points: 2 }, { user_id: 'a', interactions: 1, provisional_points: 1 }] : { status: 'unpublished' } }));
    const response = await admin(req({ action: 'snapshot', cutoff: '2020-01-01T00:00:00Z' }));
    expect(await response.json()).toEqual({ data: { status: 'unpublished' } });
    expect(mockRpc).toHaveBeenCalledWith('marketing_prepare_snapshot', expect.objectContaining({ p_actor: actor, p_digest: expect.stringMatching(/^[0-9a-f]{64}$/), p_manifest: [{ user_id: 'a', interactions: 1, provisional_points: 1 }, { user_id: 'b', interactions: 2, provisional_points: 2 }] }));
  });
  it('reports snapshot read and immutable-write conflicts', async () => {
    mockRpc.mockResolvedValue({ error: {} }); expect((await admin(req({ action: 'snapshot', cutoff: '2020-01-01T00:00:00Z' }))).status).toBe(503);
    mockRpc.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ error: {} }); expect((await admin(req({ action: 'snapshot', cutoff: '2020-01-01T00:00:00Z' }))).status).toBe(409);
  });
  it('handles unexpected service errors', async () => {
    mockIdentity.mockRejectedValue(new Error('Unavailable')); expect((await admin(req({ action: 'seed' }))).status).toBe(503);
  });
});
describe('recipient and activity endpoints', () => {
  it('GET is a confirmation page and never changes consent', async () => {
    const response = await unsubscribePage(new Request(`https://api.hashpass.tech/api/marketing/unsubscribe?token=${actor}`));
    expect(response.status).toBe(200); expect(await response.text()).toContain('method="post"'); expect(mockRpc).not.toHaveBeenCalled();
  });
  it('supports unauthenticated opaque-token one-click POST', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    expect((await unsubscribe(req({}, `marketing/unsubscribe?token=${actor}`))).status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('marketing_unsubscribe', { p_token: actor }); expect(mockIdentity).not.toHaveBeenCalled();
  });
  it('rejects invalid tokens and surfaces unsubscribe failures', async () => {
    expect((await unsubscribePage(req({}, 'marketing/unsubscribe?token=bad'))).status).toBe(400);
    expect((await unsubscribe(req({}, 'marketing/unsubscribe?token=bad'))).status).toBe(400);
    mockRpc.mockResolvedValue({ data: false }); expect((await unsubscribe(req({}, `marketing/unsubscribe?token=${actor}`))).status).toBe(400);
    mockRpc.mockRejectedValue(new Error('down')); expect((await unsubscribe(req({}, `marketing/unsubscribe?token=${actor}`))).status).toBe(503);
  });
  it('uses the canonical session identity and never trusts submitted points or user IDs', async () => {
    const response = await activity(req({ path: '/contacts?card=private', userId: 'attacker', points: 999 }));
    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('record_marketing_activity', expect.objectContaining({ p_user: 'registry-user', p_source: 'observed_client', p_key: expect.stringMatching(/^navigation:\/contacts:\d{4}-\d{2}-\d{2}$/) }));
    expect((await response.json()).data.provisionalPoints).toBe(0);
  });
  it('keeps navigation successful when activity storage throws', async () => {
    mockRpc.mockRejectedValue(new Error('database unavailable'));
    const response = await activity(req({ path: '/contacts' }));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ data: { recorded: false, trust: 'observed', provisionalPoints: 0 } });
  });
  it('requires linked identities and excludes sensitive paths', async () => {
    expect((await activity(req({ path: '/auth/callback?code=secret' }))).status).toBe(400);
    mockIdentity.mockResolvedValue({ supabaseUserId: actor }); expect((await activity(req({ path: '/contacts' }))).status).toBe(403);
    mockIdentity.mockResolvedValue({ error: 'Unauthorized', status: 401 }); expect((await activity(req({ path: '/contacts' }))).status).toBe(401);
  });
});
