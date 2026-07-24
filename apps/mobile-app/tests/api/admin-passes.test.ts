/// <reference types="jest" />

const mockAuthenticateRequest = jest.fn();
const mockRpc = jest.fn();
const mockRateLimitOk = jest.fn((_key: string) => true);

jest.mock('@hashpass/auth', () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
}));
jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: jest.fn(() => ({ rpc: (...args: unknown[]) => mockRpc(...args) })),
}));
jest.mock('@/lib/bsl/rateLimit', () => ({
  rateLimitOk: (key: string) => mockRateLimitOk(key),
}));

describe('POST /api/admin/passes', () => {
  const actorId = '7f60f5d2-5948-4df1-9670-2f9177cf2fe4';
  const targetId = '8f60f5d2-5948-4df1-9670-2f9177cf2fe4';

  beforeEach(() => {
    jest.resetModules();
    mockAuthenticateRequest.mockReset();
    mockRpc.mockReset();
    mockRateLimitOk.mockReturnValue(true);
    mockAuthenticateRequest.mockResolvedValue({ user: { id: actorId }, error: null });
  });

  const post = async (body: Record<string, unknown>) => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/passes+api');
    return POST(new Request('https://api.hashpass.tech/api/admin/passes', {
      method: 'POST',
      body: JSON.stringify(body),
    }));
  };

  it('rejects invalid input before authorization or database mutation', async () => {
    const response = await post({ action: 'create', eventId: '../other', userId: targetId, passType: 'vip' });
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('does not mutate passes when the caller lacks event access', async () => {
    mockRpc.mockResolvedValueOnce({ data: false, error: null });
    const response = await post({ action: 'create', eventId: 'chile2026', userId: targetId, passType: 'vip' });
    expect(response.status).toBe(403);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('has_event_admin_access', expect.objectContaining({
      p_user_id: actorId,
      p_event_id: 'chile2026',
      p_include_moderator: false,
    }));
  });

  it('uses the authenticated actor for an authorized pass mutation', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: { id: 'pass-1' }, error: null });
    const response = await post({ action: 'create', eventId: 'chile2026', userId: targetId, passType: 'vip' });
    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenLastCalledWith('admin_mutate_event_pass', expect.objectContaining({
      p_actor_user_id: actorId,
      p_event_id: 'chile2026',
      p_user_id: targetId,
      p_pass_type: 'vip',
    }));
  });
});
