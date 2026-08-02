/// <reference types="jest" />

const mockAuthorizeEventAdmin = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockRateLimitOk = jest.fn((_key: string) => true);

jest.mock('@/lib/server/event-admin', () => ({
  authorizeEventAdmin: (...args: unknown[]) => mockAuthorizeEventAdmin(...args),
}));
jest.mock('@/lib/bsl/rateLimit', () => ({
  rateLimitOk: (key: string) => mockRateLimitOk(key),
}));

describe('/api/admin/pass-codes', () => {
  const actorId = '7f60f5d2-5948-4df1-9670-2f9177cf2fe4';
  const codeId = '8f60f5d2-5948-4df1-9670-2f9177cf2fe4';

  beforeEach(() => {
    jest.resetModules();
    mockAuthorizeEventAdmin.mockReset();
    mockRpc.mockReset();
    mockFrom.mockReset();
    mockRateLimitOk.mockReturnValue(true);
    mockAuthorizeEventAdmin.mockResolvedValue({
      userId: actorId,
      supabase: { rpc: (...args: unknown[]) => mockRpc(...args), from: (...args: unknown[]) => mockFrom(...args) },
    });
  });

  const post = async (body: Record<string, unknown>) => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/pass-codes+api');
    return POST(new Request('https://api.hashpass.tech/api/admin/pass-codes', {
      method: 'POST',
      body: JSON.stringify(body),
    }));
  };

  const get = async (eventId: string) => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/admin/pass-codes+api');
    return GET(new Request(`https://api.hashpass.tech/api/admin/pass-codes?eventId=${eventId}`));
  };

  it('rejects malformed code campaigns before authorization', async () => {
    const response = await post({
      action: 'create', eventId: 'chile2026', code: 'bad!', label: 'Bad code', passType: 'vip', maxClaims: 1,
    });

    expect(response.status).toBe(400);
    expect(mockAuthorizeEventAdmin).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('creates an unlimited code through the authorized auditable RPC', async () => {
    mockRpc.mockResolvedValue({ data: { id: codeId, status: 'create' }, error: null });

    const response = await post({
      action: 'create', eventId: 'chile2026', code: ' bsl2026chile ', label: 'Chile public promotion', passType: 'general', maxClaims: null,
    });

    expect(response.status).toBe(200);
    expect(mockAuthorizeEventAdmin).toHaveBeenCalledWith(expect.any(Request), 'chile2026');
    expect(mockRpc).toHaveBeenCalledWith('admin_manage_event_pass_claim_code', expect.objectContaining({
      p_actor_user_id: actorId,
      p_event_id: 'chile2026',
      p_action: 'create',
      p_code: 'BSL2026CHILE',
      p_pass_type: 'general',
      p_max_claims: null,
    }));
    await expect(response.json()).resolves.toMatchObject({ code: 'BSL2026CHILE' });
  });

  it('allows event admins to deactivate only a well-formed code id', async () => {
    mockRpc.mockResolvedValue({ data: { id: codeId, status: 'deactivate' }, error: null });

    const response = await post({ action: 'deactivate', eventId: 'colombia2026', codeId });

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('admin_manage_event_pass_claim_code', expect.objectContaining({
      p_event_id: 'colombia2026', p_action: 'deactivate', p_code_id: codeId,
    }));
  });

  it('lists only operational metadata, never a raw code or hash', async () => {
    const limit = jest.fn().mockResolvedValue({
      data: [{ id: codeId, label: 'Chile public promotion', max_claims: null, claimed_count: 4 }],
      error: null,
    });
    const order = jest.fn(() => ({ limit }));
    const eq = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ eq }));
    mockFrom.mockReturnValue({ select });

    const response = await get('chile2026');

    expect(response.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith('pass_claim_codes');
    expect(select).toHaveBeenCalledWith('id, event_id, label, pass_type, max_claims, claimed_count, expires_at, is_active, created_at');
    await expect(response.json()).resolves.toEqual({
      data: [{ id: codeId, label: 'Chile public promotion', max_claims: null, claimed_count: 4 }],
    });
  });

  it('reports a migration-required response when pass-code storage is missing', async () => {
    const limit = jest.fn().mockResolvedValue({
      data: null,
      error: { code: '42P01', message: 'relation "pass_claim_codes" does not exist' },
    });
    const order = jest.fn(() => ({ limit }));
    const eq = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ eq }));
    mockFrom.mockReturnValue({ select });

    const response = await get('chile2026');

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Pass-code storage is not installed yet. Apply the BSL database migrations and try again.',
    });
  });
});
