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

  const invalidJsonPost = async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/pass-codes+api');
    return POST(new Request('https://api.hashpass.tech/api/admin/pass-codes', {
      method: 'POST',
      body: '{',
    }));
  };

  const mockPassCodeList = (result: { data: unknown; error: unknown }) => {
    const limit = jest.fn().mockResolvedValue(result);
    const order = jest.fn(() => ({ limit }));
    const eq = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ eq }));
    mockFrom.mockReturnValue({ select });
  };

  it('rate limits both pass-code reads and mutations before accessing Supabase', async () => {
    mockRateLimitOk.mockReturnValue(false);

    expect((await get('chile2026')).status).toBe(429);
    expect((await post({ action: 'create', eventId: 'chile2026' })).status).toBe(429);
    expect(mockAuthorizeEventAdmin).not.toHaveBeenCalled();
  });

  it('validates list parameters and forwards an authorization response unchanged', async () => {
    expect((await get('not a valid event id')).status).toBe(400);
    mockAuthorizeEventAdmin.mockResolvedValue({
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await get('chile2026');
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

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

  it('generates a code when an admin does not provide one', async () => {
    const randomUuid = jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      'aabbccdd-1111-4222-8333-eeeeeeeeeeee',
    );
    mockRpc.mockResolvedValue({ data: { id: codeId, status: 'create' }, error: null });

    const response = await post({
      action: 'create', eventId: 'chile2026', label: 'Single VIP invitation', passType: 'vip', maxClaims: 1,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ code: 'CHILE2026-AABBCCDD1111' });
    randomUuid.mockRestore();
  });

  it('allows event admins to deactivate only a well-formed code id', async () => {
    mockRpc.mockResolvedValue({ data: { id: codeId, status: 'deactivate' }, error: null });

    const response = await post({ action: 'deactivate', eventId: 'colombia2026', codeId });

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('admin_manage_event_pass_claim_code', expect.objectContaining({
      p_event_id: 'colombia2026', p_action: 'deactivate', p_code_id: codeId,
    }));
  });

  it('rejects malformed mutations before authorization', async () => {
    expect((await invalidJsonPost()).status).toBe(400);
    expect((await post({ action: 'unknown', eventId: 'chile2026' })).status).toBe(400);
    expect((await post({ action: 'deactivate', eventId: 'chile2026', codeId: 'not-a-uuid' })).status).toBe(400);
    expect((await post({
      action: 'create', eventId: 'chile2026', code: 'VIP-ONE', label: 'VIP', passType: 'vip', maxClaims: 0,
    })).status).toBe(400);
    expect((await post({
      action: 'create', eventId: 'chile2026', code: 'VIP-ONE', label: 'VIP', passType: 'vip', expiresAt: 'not-a-date',
    })).status).toBe(400);
    expect(mockAuthorizeEventAdmin).not.toHaveBeenCalled();
  });

  it('returns API authorization responses for valid mutations without calling the RPC', async () => {
    mockAuthorizeEventAdmin.mockResolvedValue({
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await post({ action: 'deactivate', eventId: 'chile2026', codeId });
    expect(response.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
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

  it('returns an empty list and a recoverable server error when listing codes fails', async () => {
    mockPassCodeList({ data: null, error: null });
    await expect((await get('chile2026')).json()).resolves.toEqual({ data: [] });

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockPassCodeList({ data: null, error: { code: 'XX000', message: 'temporary database failure' } });
    const response = await get('chile2026');

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Unable to list pass codes' });
    errorSpy.mockRestore();
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

  it.each([
    [{ code: '42501', message: 'permission denied' }, 403, 'Forbidden'],
    [{ code: '22023', message: 'invalid state' }, 400, 'invalid state'],
    [{ code: 'XX000', message: 'database unavailable' }, 500, 'Unable to update pass code'],
  ])('maps pass-code RPC error %o to the appropriate response', async (error, status, message) => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValue({ data: null, error });

    const response = await post({ action: 'reactivate', eventId: 'chile2026', codeId });

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: message });
    errorSpy.mockRestore();
  });
});
