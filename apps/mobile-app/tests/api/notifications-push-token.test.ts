/// <reference types="jest" />

const mockResolveNotificationIdentity = jest.fn<Promise<any>, any[]>();
const mockGetSupabaseServerForRequest = jest.fn<any, any[]>();
const mockRateLimitOk = jest.fn<boolean, any[]>();
const mockUpsert = jest.fn();
const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
let mockQueryResult: { count?: number; error: unknown } = { count: 2, error: null };

function readTestEnv(key: string) {
  const value = Reflect.get(process.env, key);
  return typeof value === 'string' ? value : undefined;
}

function writeTestEnv(key: string, value: string | undefined) {
  if (value === undefined) Reflect.deleteProperty(process.env, key);
  else Reflect.set(process.env, key, value);
}

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
    mockQueryResult = { count: 2, error: null };
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
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(mockQueryResult).then(resolve),
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

  it('returns identity errors and requires an app-linked account', async () => {
    mockResolveNotificationIdentity.mockResolvedValueOnce({ status: 401, error: 'Sign in required' });
    const unauthorized = await loadRoute().GET(new Request('https://api.hashpass.tech/api/notifications/push-token'));
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toMatchObject({ error: 'Sign in required' });

    mockResolveNotificationIdentity.mockResolvedValueOnce({ supabaseUserId: null, registryUserId: 'registry-id', email: 'unlinked@example.com' });
    const unlinked = await loadRoute().GET(new Request('https://api.hashpass.tech/api/notifications/push-token'));
    expect(unlinked.status).toBe(403);
    expect(mockGetSupabaseServerForRequest).not.toHaveBeenCalled();
  });

  it('reports push status database errors and exposes the configured public key only when fully configured', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      mockQueryResult = { count: 0, error: { message: 'database unavailable' } };
      const failed = await loadRoute().GET(new Request('https://api.hashpass.tech/api/notifications/push-token'));
      expect(failed.status).toBe(500);

      const oldPublic = readTestEnv('WEB_PUSH_VAPID_PUBLIC_KEY');
      const oldPrivate = readTestEnv('WEB_PUSH_VAPID_PRIVATE_KEY');
      const oldSubject = readTestEnv('WEB_PUSH_VAPID_SUBJECT');
      writeTestEnv('WEB_PUSH_VAPID_PUBLIC_KEY', 'public-test-key');
      writeTestEnv('WEB_PUSH_VAPID_PRIVATE_KEY', 'private-test-key');
      writeTestEnv('WEB_PUSH_VAPID_SUBJECT', 'mailto:support@hashpass.app');
      mockQueryResult = { count: 3, error: null };
      const configured = await loadRoute().GET(new Request('https://api.hashpass.tech/api/notifications/push-token'));
      expect(await configured.json()).toEqual({ enabledDeviceCount: 3, webPushPublicKey: 'public-test-key' });
      writeTestEnv('WEB_PUSH_VAPID_PUBLIC_KEY', oldPublic);
      writeTestEnv('WEB_PUSH_VAPID_PRIVATE_KEY', oldPrivate);
      writeTestEnv('WEB_PUSH_VAPID_SUBJECT', oldSubject);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('rate limits registration before identity lookup and rejects malformed or unsupported requests', async () => {
    mockRateLimitOk.mockReturnValueOnce(false);
    const limited = await loadRoute().POST(new Request('https://api.hashpass.tech/api/notifications/push-token', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }));
    expect(limited.status).toBe(429);
    expect(mockResolveNotificationIdentity).not.toHaveBeenCalled();

    mockRateLimitOk.mockReturnValue(true);
    const invalidJson = await loadRoute().POST(new Request('https://api.hashpass.tech/api/notifications/push-token', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{',
    }));
    expect(invalidJson.status).toBe(400);
    const unsupported = await loadRoute().POST(new Request('https://api.hashpass.tech/api/notifications/push-token', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'ExpoPushToken[device]', platform: 'watchos' }),
    }));
    expect(unsupported.status).toBe(400);
    expect(await unsupported.json()).toMatchObject({ error: 'A supported push platform is required' });
  });

  it('accepts trusted browser push providers and reports upsert errors', async () => {
    const endpoint = 'https://push.example.notify.windows.com/device/token';
    const windows = await loadRoute().POST(new Request('https://api.hashpass.tech/api/notifications/push-token', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: endpoint, platform: 'web', subscription: { endpoint, keys: { p256dh: 'p', auth: 'a' } } }),
    }));
    expect(windows.status).toBe(200);

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockUpsert.mockResolvedValueOnce({ error: { message: 'database unavailable' } });
    try {
      const failed = await loadRoute().POST(new Request('https://api.hashpass.tech/api/notifications/push-token', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'ExponentPushToken[device]', platform: 'android' }),
      }));
      expect(failed.status).toBe(500);
      expect(await failed.json()).toMatchObject({ error: 'Unable to register this device for push notifications' });
    } finally {
      consoleError.mockRestore();
    }
  });

  it('rejects malformed browser subscription details and long or mismatched endpoints', async () => {
    const cases = [
      { token: 'https://fcm.googleapis.com/fcm/send/device', subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/device' } },
      { token: 'http://fcm.googleapis.com/fcm/send/device', subscription: { endpoint: 'http://fcm.googleapis.com/fcm/send/device', keys: { p256dh: 'p', auth: 'a' } } },
      { token: 'https://fcm.googleapis.com/fcm/send/device', subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/device', keys: { p256dh: 'x'.repeat(257), auth: 'a' } } },
      { token: 'https://fcm.googleapis.com/fcm/send/device', subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/device', keys: { p256dh: 'p', auth: 'x'.repeat(129) } } },
      { token: 'https://fcm.googleapis.com/fcm/send/other', subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/device', keys: { p256dh: 'p', auth: 'a' } } },
    ];
    for (const input of cases) {
      const response = await loadRoute().POST(new Request('https://api.hashpass.tech/api/notifications/push-token', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...input, platform: 'web' }),
      }));
      expect(response.status).toBe(400);
    }
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('reports opt-out identity, rate limit, and database errors', async () => {
    mockRateLimitOk.mockReturnValueOnce(false);
    const limited = await loadRoute().DELETE(new Request('https://api.hashpass.tech/api/notifications/push-token'));
    expect(limited.status).toBe(429);

    mockRateLimitOk.mockReturnValue(true);
    mockResolveNotificationIdentity.mockResolvedValueOnce({ status: 401, error: 'Sign in required' });
    expect((await loadRoute().DELETE(new Request('https://api.hashpass.tech/api/notifications/push-token'))).status).toBe(401);

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQueryResult = { error: { message: 'update failed' } };
    try {
      const failed = await loadRoute().DELETE(new Request('https://api.hashpass.tech/api/notifications/push-token'));
      expect(failed.status).toBe(500);
      expect(await failed.json()).toMatchObject({ error: 'Unable to update push notification settings' });
    } finally {
      consoleError.mockRestore();
    }
  });
});
