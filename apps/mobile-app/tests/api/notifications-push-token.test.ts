/// <reference types="jest" />

const mockResolveNotificationIdentity = jest.fn<Promise<any>, any[]>();
const mockGetSupabaseServerForRequest = jest.fn<any, any[]>();
const mockRateLimitOk = jest.fn<boolean, any[]>();
const mockUpsert = jest.fn();
const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();

jest.mock('@/lib/server/resolve-notification-identity', () => ({
  isResolveIdentityError: (value: unknown) => typeof (value as { status?: unknown })?.status === 'number',
  resolveNotificationIdentity: (...args: unknown[]) => mockResolveNotificationIdentity(...args),
}));
jest.mock('@/lib/bsl/rateLimit', () => ({
  rateLimitOk: (...args: unknown[]) => mockRateLimitOk(...args),
}));
jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: (...args: unknown[]) => mockGetSupabaseServerForRequest(...args),
}));

describe('/api/notifications/push-token', () => {
  const userId = '22222222-2222-4222-8222-222222222222';
  let chain: any;

  beforeEach(() => {
    jest.resetModules();
    mockResolveNotificationIdentity.mockReset().mockResolvedValue({ supabaseUserId: userId, registryUserId: 'registry-id', email: 'user@example.com' });
    mockGetSupabaseServerForRequest.mockReset();
    mockRateLimitOk.mockReset().mockReturnValue(true);
    mockUpsert.mockReset().mockResolvedValue({ error: null });
    mockUpdate.mockReset().mockReturnThis();
    mockEq.mockReset().mockReturnThis();
    mockSelect.mockReset().mockReturnThis();
    chain = {
      select: (...args: unknown[]) => { mockSelect(...args); return chain; },
      eq: (...args: unknown[]) => { mockEq(...args); return chain; },
      upsert: (...args: unknown[]) => mockUpsert(...args),
      update: (...args: unknown[]) => { mockUpdate(...args); return chain; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ count: 2, error: null }).then(resolve),
    };
    mockGetSupabaseServerForRequest.mockReturnValue({ from: () => chain });
  });

  const loadRoute = () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    return require('../../app/api/notifications/push-token+api');
  };

  it('rejects token registration before writing when the token or platform is invalid', async () => {
    const response = await loadRoute().POST(new Request('https://api.hashpass.tech/api/notifications/push-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'not-a-push-token', platform: 'web' }),
    }));
    expect(response.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('registers only the signed-in account token and marks it opted in', async () => {
    const response = await loadRoute().POST(new Request('https://api.hashpass.tech/api/notifications/push-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'ExponentPushToken[test-device]', platform: 'android' }),
    }));
    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: userId,
      token: 'ExponentPushToken[test-device]',
      platform: 'android',
      enabled: true,
    }), { onConflict: 'token' });
  });

  it('registers a browser push subscription without accepting a caller supplied account id', async () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/browser-endpoint';
    const subscription = { endpoint, keys: { p256dh: 'browser-public-key', auth: 'browser-auth-secret' } };
    const response = await loadRoute().POST(new Request('https://api.hashpass.tech/api/notifications/push-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: endpoint, platform: 'web', subscription, userId: '99999999-9999-4999-8999-999999999999' }),
    }));
    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: userId,
      token: endpoint,
      platform: 'web',
      subscription,
      enabled: true,
    }), { onConflict: 'token' });
  });

  it('rejects non-HTTPS and untrusted browser push endpoints', async () => {
    const endpoint = 'https://localhost/private';
    const response = await loadRoute().POST(new Request('https://api.hashpass.tech/api/notifications/push-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: endpoint, platform: 'web', subscription: { endpoint, keys: { p256dh: 'key', auth: 'secret' } } }),
    }));
    expect(response.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('disables push for the authenticated account without accepting a caller supplied user id', async () => {
    const response = await loadRoute().DELETE(new Request('https://api.hashpass.tech/api/notifications/push-token', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: '99999999-9999-4999-8999-999999999999' }),
    }));
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    expect(mockEq).toHaveBeenCalledWith('user_id', userId);
  });

  it('does not expose token values when reading opt-in state', async () => {
    const response = await loadRoute().GET(new Request('https://api.hashpass.tech/api/notifications/push-token'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabledDeviceCount: 2, webPushPublicKey: null });
    expect(mockSelect).toHaveBeenCalledWith('id', { count: 'exact', head: true });
  });
});
