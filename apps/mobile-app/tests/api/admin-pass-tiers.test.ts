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

describe('/api/admin/pass-tiers', () => {
  const actorId = '7f60f5d2-5948-4df1-9670-2f9177cf2fe4';

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
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/pass-tiers+api');
    return POST(new Request('https://api.hashpass.tech/api/admin/pass-tiers', {
      method: 'POST', body: JSON.stringify(body),
    }));
  };

  const get = async (eventId: string) => {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/admin/pass-tiers+api');
    return GET(new Request(`https://api.hashpass.tech/api/admin/pass-tiers?eventId=${eventId}`));
  };

  it('lists the selected event tier catalog only after authorization', async () => {
    const order = jest.fn().mockResolvedValue({ data: [{ pass_type: 'general' }], error: null });
    const eq = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ eq }));
    mockFrom.mockReturnValue({ select });

    const response = await get('chile2026');

    expect(response.status).toBe(200);
    expect(mockAuthorizeEventAdmin).toHaveBeenCalledWith(expect.any(Request), 'chile2026');
    expect(mockFrom).toHaveBeenCalledWith('event_pass_tiers');
    await expect(response.json()).resolves.toEqual({ data: [{ pass_type: 'general' }] });
  });

  it('returns the authorization response without querying tier data', async () => {
    mockAuthorizeEventAdmin.mockResolvedValue({
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    });
    const response = await get('chile2026');
    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects malformed event IDs before authorization', async () => {
    const response = await get('../chile2026');
    expect(response.status).toBe(400);
    expect(mockAuthorizeEventAdmin).not.toHaveBeenCalled();
  });

  it('returns a safe error when listing configured tiers fails', async () => {
    const order = jest.fn().mockResolvedValue({ data: null, error: { message: 'database unavailable' } });
    const eq = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ eq }));
    mockFrom.mockReturnValue({ select });
    const response = await get('chile2026');
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Unable to load pass tiers' });
  });

  it('rejects incomplete tier settings before authorization', async () => {
    const response = await post({ eventId: 'chile2026', passType: 'general', maxMeetingRequests: -1 });
    expect(response.status).toBe(400);
    expect(mockAuthorizeEventAdmin).not.toHaveBeenCalled();
  });

  it('persists event-specific limits and price through the audited RPC', async () => {
    mockRpc.mockResolvedValue({ data: { pass_type: 'general' }, error: null });

    const response = await post({
      eventId: 'chile2026',
      passType: 'general',
      maxMeetingRequests: 10,
      maxBoostAmount: 100,
      priceCents: 9900,
      currency: 'usd',
      priceLabel: null,
    });

    expect(response.status).toBe(200);
    expect(mockAuthorizeEventAdmin).toHaveBeenCalledWith(expect.any(Request), 'chile2026');
    expect(mockRpc).toHaveBeenCalledWith('admin_update_event_pass_tier', {
      p_actor_user_id: actorId,
      p_event_id: 'chile2026',
      p_pass_type: 'general',
      p_max_meeting_requests: 10,
      p_max_boost_amount: 100,
      p_price_cents: 9900,
      p_currency: 'USD',
      p_price_label: null,
    });
  });

  it('handles rate limits, invalid JSON, and database update failures safely', async () => {
    mockRateLimitOk.mockReturnValueOnce(false);
    let response = await post({});
    expect(response.status).toBe(429);

    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/pass-tiers+api');
    response = await POST(new Request('https://api.hashpass.tech/api/admin/pass-tiers', {
      method: 'POST', body: '{',
    }));
    expect(response.status).toBe(400);

    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'write failed' } });
    response = await post({
      eventId: 'chile2026', passType: 'general', maxMeetingRequests: 10,
      maxBoostAmount: 100, priceCents: 9900, currency: 'USD', priceLabel: null,
    });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Unable to update pass tier' });
  });
});
