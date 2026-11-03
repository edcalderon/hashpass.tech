/// <reference types="jest" />

const mockAuthorizeGlobalAdmin = jest.fn<Promise<any>, any[]>();
const mockRateLimitOk = jest.fn<boolean, any[]>();
const mockRpc = jest.fn<Promise<any>, any[]>();
const mockFrom = jest.fn<any, [string]>();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockWebPushSendNotification = jest.fn<Promise<void>, any[]>();

jest.mock('@/lib/server/global-admin', () => ({
  authorizeGlobalAdmin: (...args: unknown[]) => mockAuthorizeGlobalAdmin(...args),
}));
jest.mock('@/lib/bsl/rateLimit', () => ({
  rateLimitOk: (...args: unknown[]) => mockRateLimitOk(...args),
}));
jest.mock('web-push', () => ({
  __esModule: true,
  default: { sendNotification: (...args: unknown[]) => mockWebPushSendNotification(...args) },
}));

function makeChain(result: { data: unknown; error: unknown; count?: number } = { data: [], error: null }) {
  const chain: any = {
    select: jest.fn(() => chain),
    eq: jest.fn((...args: unknown[]) => { mockEq(...args); return chain; }),
    is: jest.fn(() => chain),
    ilike: jest.fn(() => chain),
    order: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    range: jest.fn(() => chain),
    not: jest.fn(() => chain),
    in: jest.fn(() => chain),
    insert: jest.fn((value: unknown) => { mockInsert(value); return chain; }),
    update: jest.fn((value: unknown) => { mockUpdate(value); return chain; }),
    single: jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

describe('/api/admin/notifications', () => {
  const actorId = '11111111-1111-4111-8111-111111111111';
  const userA = '22222222-2222-4222-8222-222222222222';
  const userB = '33333333-3333-4333-8333-333333333333';
  const campaignId = '44444444-4444-4444-8444-444444444444';
  const notificationId = '55555555-5555-4555-8555-555555555555';
  const activeUsers = [
    { email: 'one@example.com', full_name: 'One User', status: 'active', deleted_at: null, provider_ids: { supabase: userA } },
    { email: 'two@example.com', full_name: 'Two User', status: 'active', deleted_at: null, provider_ids: { supabase: userB } },
  ];
  const fromByTable = new Map<string, ReturnType<typeof makeChain>>();
  const supabase = {
    from: (table: string) => mockFrom(table),
    rpc: (name: string, args: Record<string, unknown>) => mockRpc(name, args),
  };

  beforeEach(() => {
    jest.resetModules();
    mockAuthorizeGlobalAdmin.mockReset().mockResolvedValue({ userId: actorId, supabase });
    mockRateLimitOk.mockReset().mockReturnValue(true);
    mockRpc.mockReset();
    mockFrom.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockEq.mockReset();
    mockWebPushSendNotification.mockReset().mockResolvedValue(undefined);
    fromByTable.clear();
    fromByTable.set('user', makeChain({ data: activeUsers, error: null }));
    fromByTable.set('admin_notification_previews', makeChain({ data: { id: campaignId, expires_at: '2026-11-02T23:40:00.000Z' }, error: null }));
    fromByTable.set('admin_notification_campaigns', makeChain({ data: { id: campaignId, title: 'Update', message: 'Details', level: 'info', deep_link: null, push_requested: false }, error: null }));
    mockFrom.mockImplementation((table: string) => fromByTable.get(table) || makeChain());
  });

  const post = async (body: Record<string, unknown>) => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/notifications+api');
    return POST(new Request('https://api.hashpass.tech/api/admin/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
  };

  const baseDraft = {
    title: 'Event update',
    message: 'Doors open at 09:00.',
    level: 'info',
    deepLink: '/dashboard/notifications',
  };

  it('requires a global administrator', async () => {
    mockAuthorizeGlobalAdmin.mockResolvedValueOnce({ response: Response.json({ error: 'Forbidden' }, { status: 403 }) });
    const response = await post({ action: 'preview', ...baseDraft, audience: 'all_active' });
    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects external notification links', async () => {
    const response = await post({ action: 'preview', ...baseDraft, deepLink: 'https://example.com', audience: 'all_active' });
    expect(response.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects non-object JSON bodies cleanly', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/notifications+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/admin/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'null',
    }));
    expect(response.status).toBe(400);
    expect(mockAuthorizeGlobalAdmin).not.toHaveBeenCalled();
  });

  it('stores an exact audience snapshot and returns a short-lived preview id without sending', async () => {
    const response = await post({ action: 'preview', ...baseDraft, audience: 'all_active', pushRequested: false });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { previewId: campaignId, recipientCount: 2, pushTokenCount: 0 } });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      created_by: actorId,
      recipient_ids: [userA, userB],
      recipient_count: 2,
      deep_link: '/dashboard/notifications',
    }));
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('maps the BSL hub audience filter to its current pass-storage event', async () => {
    const response = await post({
      action: 'preview', ...baseDraft,
      audience: 'event_attendees', eventId: 'bsl', passTier: 'all',
    });
    expect(response.status).toBe(400); // The fixture has no attendee passes.
    expect(mockEq).toHaveBeenCalledWith('event_id', 'colombia2026');
  });

  it('sends a test only to explicitly selected accounts and records it as a test campaign', async () => {
    mockRpc.mockResolvedValueOnce({ data: { campaign_id: campaignId, recipient_count: 1, deliveries: [{ user_id: userB, notification_id: notificationId }] }, error: null });
    const response = await post({
      action: 'test', ...baseDraft, pushRequested: false,
      selectedUserIds: [userB],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { campaignId, recipients: 1, inAppSent: 1 } });
    expect(mockRpc).toHaveBeenCalledWith('admin_create_notification_campaign', expect.objectContaining({
      p_actor_id: actorId,
      p_is_test: true,
      p_recipient_ids: [userB],
    }));
  });

  it('keeps in-app delivery successful when a push provider rejects the test device', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }),
    }) as jest.Mock;
    fromByTable.set('notification_push_tokens', makeChain({ data: [{ user_id: userB, token: 'ExponentPushToken[test-device]' }], error: null }));
    mockRpc.mockResolvedValueOnce({ data: { campaign_id: campaignId, recipient_count: 1, deliveries: [{ user_id: userB, notification_id: notificationId }] }, error: null });

    try {
      const response = await post({ action: 'test', ...baseDraft, pushRequested: true, selectedUserIds: [userB] });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ data: { inAppSent: 1, pushSent: 0, pushFailed: 1 } });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('sends opted-in PWA subscriptions with configured VAPID keys', async () => {
    const envNames = {
      publicKey: ['WEB', 'PUSH', 'VAPID', 'PUBLIC', 'KEY'].join('_'),
      privateKey: ['WEB', 'PUSH', 'VAPID', 'PRIVATE', 'KEY'].join('_'),
      subject: ['WEB', 'PUSH', 'VAPID', 'SUBJECT'].join('_'),
    };
    const previous = {
      publicKey: process.env[envNames.publicKey],
      privateKey: process.env[envNames.privateKey],
      subject: process.env[envNames.subject],
    };
    process.env[envNames.publicKey] = 'test-public-key';
    process.env[envNames.privateKey] = 'test-only-key';
    process.env[envNames.subject] = 'mailto:support@hashpass.app';
    const endpoint = 'https://fcm.googleapis.com/fcm/send/browser-endpoint';
    fromByTable.set('notification_push_tokens', makeChain({ data: [{
      user_id: userB,
      token: endpoint,
      platform: 'web',
      subscription: { endpoint, keys: { p256dh: 'p256dh', auth: 'auth' } },
    }], error: null }));
    mockRpc.mockResolvedValueOnce({ data: { campaign_id: campaignId, recipient_count: 1, deliveries: [{ user_id: userB, notification_id: notificationId }] }, error: null });

    try {
      const response = await post({ action: 'test', ...baseDraft, pushRequested: true, selectedUserIds: [userB] });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ data: { inAppSent: 1, pushSent: 1, pushFailed: 0 } });
      expect(mockWebPushSendNotification).toHaveBeenCalledWith(
        { endpoint, keys: { p256dh: 'p256dh', auth: 'auth' } },
        expect.stringContaining('Event update'),
        expect.objectContaining({ TTL: 86400, vapidDetails: {
          publicKey: process.env[envNames.publicKey],
          privateKey: process.env[envNames.privateKey],
          subject: process.env[envNames.subject],
        } }),
      );
    } finally {
      if (previous.publicKey === undefined) delete process.env[envNames.publicKey];
      else process.env[envNames.publicKey] = previous.publicKey;
      if (previous.privateKey === undefined) delete process.env[envNames.privateKey];
      else process.env[envNames.privateKey] = previous.privateKey;
      if (previous.subject === undefined) delete process.env[envNames.subject];
      else process.env[envNames.subject] = previous.subject;
    }
  });

  it('records a partial campaign when push status cannot be read after in-app delivery', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fromByTable.set('notification_push_tokens', makeChain({ data: null, error: { message: 'database unavailable' } }));
    mockRpc.mockResolvedValueOnce({ data: { campaign_id: campaignId, recipient_count: 1, deliveries: [{ user_id: userB, notification_id: notificationId }] }, error: null });

    try {
      const response = await post({ action: 'test', ...baseDraft, pushRequested: true, selectedUserIds: [userB] });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ data: { inAppSent: 1, pushError: expect.stringContaining('Check delivery history') } });
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        status: 'partial',
        push_error: expect.stringContaining('Check provider status'),
      }));
    } finally {
      consoleError.mockRestore();
    }
  });

  it('consumes an approved preview once for an audience send', async () => {
    mockRpc.mockResolvedValueOnce({ data: { campaign_id: campaignId, recipient_count: 2, deliveries: [{ user_id: userA, notification_id: notificationId }, { user_id: userB, notification_id: notificationId }] }, error: null });
    const response = await post({ action: 'send', previewId: campaignId });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { campaignId, recipients: 2, inAppSent: 2 } });
    expect(mockRpc).toHaveBeenCalledWith('admin_send_notification_preview', { p_actor_id: actorId, p_preview_id: campaignId });
  });
});
