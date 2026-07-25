/// <reference types="jest" />

const mockAuthenticateRequest = jest.fn();
const mockRpc = jest.fn();
const mockResolveNotificationIdentity = jest.fn();
const mockRateLimitOk = jest.fn((_key: string) => true);
const mockOrder = jest.fn();
const mockFrom = jest.fn((..._args: unknown[]) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: (...args: unknown[]) => mockOrder(...args),
}));

jest.mock('@hashpass/auth', () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
}));
jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: jest.fn(() => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  })),
}));
jest.mock('@/lib/bsl/rateLimit', () => ({
  rateLimitOk: (key: string) => mockRateLimitOk(key),
}));
jest.mock('@/lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: (...args: unknown[]) => mockResolveNotificationIdentity(...args),
  isResolveIdentityError: (value: { status?: unknown }) => typeof value?.status === 'number',
}));

describe('POST /api/admin/roles', () => {
  const actorId = '7f60f5d2-5948-4df1-9670-2f9177cf2fe4';
  const targetId = '8f60f5d2-5948-4df1-9670-2f9177cf2fe4';

  beforeEach(() => {
    jest.resetModules();
    mockAuthenticateRequest.mockReset();
    mockRpc.mockReset();
    mockResolveNotificationIdentity.mockReset();
    mockOrder.mockReset();
    mockFrom.mockClear();
    mockRateLimitOk.mockReturnValue(true);
    mockAuthenticateRequest.mockResolvedValue({ user: { id: actorId }, error: null });
    mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: actorId, email: 'admin@example.com' });
  });

  const post = async (body: Record<string, unknown>) => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/roles+api');
    return POST(new Request('https://api.hashpass.tech/api/admin/roles', {
      method: 'POST',
      body: JSON.stringify(body),
    }));
  };

  it('rejects invalid input before authorization or database mutation', async () => {
    const response = await post({ action: 'grant', eventId: '../other', targetUserId: targetId, role: 'event_admin' });
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects an unknown role or action without calling the RPC', async () => {
    const response = await post({ action: 'promote', eventId: 'bsl', targetUserId: targetId, role: 'event_admin' });
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('maps a 42501 (insufficient privilege) RPC error to 403', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Only a super admin may grant or revoke event_admin', code: '42501' },
    });
    const response = await post({ action: 'grant', eventId: 'bsl', targetUserId: targetId, role: 'event_admin' });
    expect(response.status).toBe(403);
    expect(mockRpc).toHaveBeenCalledWith('admin_mutate_event_role', expect.objectContaining({
      p_actor_user_id: actorId,
      p_event_id: 'bsl',
      p_action: 'grant',
      p_target_user_id: targetId,
      p_role: 'event_admin',
    }));
  });

  it('uses the authenticated actor for an authorized grant', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { event_id: 'bsl', user_id: targetId, role: 'moderator', action: 'grant' },
      error: null,
    });
    const response = await post({ action: 'grant', eventId: 'bsl', targetUserId: targetId, role: 'moderator' });
    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenLastCalledWith('admin_mutate_event_role', expect.objectContaining({
      p_actor_user_id: actorId,
      p_target_user_id: targetId,
      p_role: 'moderator',
      p_action: 'grant',
    }));
  });

  it('rate limits and validates expiry before resolving the caller', async () => {
    mockRateLimitOk.mockReturnValueOnce(false);
    const rateLimited = await post({ action: 'grant', eventId: 'bsl', targetUserId: targetId, role: 'moderator' });
    expect(rateLimited.status).toBe(429);
    expect(mockResolveNotificationIdentity).not.toHaveBeenCalled();

    const invalidExpiry = await post({
      action: 'grant',
      eventId: 'bsl',
      targetUserId: targetId,
      role: 'moderator',
      expiresAt: 'not-a-date',
    });
    expect(invalidExpiry.status).toBe(400);
    expect(mockResolveNotificationIdentity).not.toHaveBeenCalled();
  });

  it('returns authentication failures before mutating event roles', async () => {
    mockResolveNotificationIdentity.mockResolvedValueOnce({ error: 'Unauthorized', status: 401 });
    const unauthorized = await post({ action: 'grant', eventId: 'bsl', targetUserId: targetId, role: 'moderator' });
    expect(unauthorized.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();

    mockResolveNotificationIdentity.mockResolvedValueOnce({ supabaseUserId: null, email: 'unlinked@example.com' });
    const unlinked = await post({ action: 'grant', eventId: 'bsl', targetUserId: targetId, role: 'moderator' });
    expect(unlinked.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('maps invalid RPC input and unexpected mutation errors safely', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'expires_at must be in the future', code: '22023' },
    });
    const invalidRpcInput = await post({ action: 'grant', eventId: 'bsl', targetUserId: targetId, role: 'moderator' });
    expect(invalidRpcInput.status).toBe(400);
    await expect(invalidRpcInput.json()).resolves.toEqual({ error: 'expires_at must be in the future' });

    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'database unavailable', code: 'XX000' },
    });
    const unexpectedFailure = await post({ action: 'grant', eventId: 'bsl', targetUserId: targetId, role: 'moderator' });
    expect(unexpectedFailure.status).toBe(500);
    await expect(unexpectedFailure.json()).resolves.toEqual({ error: 'Unable to update role' });
  });

  it('requires a JSON request body', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/roles+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/admin/roles', { method: 'POST' }));
    expect(response.status).toBe(400);
  });
});

describe('GET /api/admin/roles', () => {
  const actorId = '7f60f5d2-5948-4df1-9670-2f9177cf2fe4';

  beforeEach(() => {
    jest.resetModules();
    mockAuthenticateRequest.mockReset();
    mockRpc.mockReset();
    mockResolveNotificationIdentity.mockReset();
    mockOrder.mockReset();
    mockFrom.mockClear();
    mockRateLimitOk.mockReturnValue(true);
    mockAuthenticateRequest.mockResolvedValue({ user: { id: actorId }, error: null });
    mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: actorId, email: 'admin@example.com' });
  });

  const get = async (eventId: string) => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/admin/roles+api');
    return GET(new Request(`https://api.hashpass.tech/api/admin/roles?eventId=${encodeURIComponent(eventId)}`));
  };

  it('rejects an invalid eventId before any authorization check', async () => {
    const response = await get('../other');
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller lacks event access, without listing anything', async () => {
    mockRpc.mockResolvedValueOnce({ data: false, error: null });
    const response = await get('bsl');
    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('lists role grants for an authorized caller', async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null });
    mockOrder.mockResolvedValueOnce({
      data: [{ id: 'r1', user_id: 'u1', role: 'event_admin', granted_by: actorId, granted_at: '2026-07-24T00:00:00Z', expires_at: null }],
      error: null,
    });
    const response = await get('bsl');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(mockFrom).toHaveBeenCalledWith('event_roles');
  });

  it('rate limits listing before checking event access', async () => {
    mockRateLimitOk.mockReturnValueOnce(false);
    const response = await get('bsl');
    expect(response.status).toBe(429);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('does not expose role data when the listing query fails', async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null });
    mockOrder.mockResolvedValueOnce({ data: null, error: { message: 'database unavailable' } });
    const response = await get('bsl');
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Unable to list roles' });
  });
});
