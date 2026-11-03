/// <reference types="jest" />

const mockAuthorizeGlobalAdmin = jest.fn<Promise<any>, any[]>();
const mockRateLimitOk = jest.fn<boolean, any[]>();
const mockRpc = jest.fn<Promise<any>, any[]>();
const mockFrom = jest.fn<any, [string]>();
const mockGetSupabaseServerForRequest = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockWebPushSendNotification = jest.fn<Promise<void>, any[]>();

function readTestEnv(key: string) {
  const value = Reflect.get(process.env, key);
  return typeof value === 'string' ? value : undefined;
}

function writeTestEnv(key: string, value: string | undefined) {
  if (value === undefined) Reflect.deleteProperty(process.env, key);
  else Reflect.set(process.env, key, value);
}

jest.mock('@/lib/server/global-admin', () => ({
  authorizeGlobalAdmin: (...args: unknown[]) => mockAuthorizeGlobalAdmin(...args),
}));
jest.mock('@/lib/bsl/rateLimit', () => ({
  rateLimitOk: (...args: unknown[]) => mockRateLimitOk(...args),
}));
jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: (...args: unknown[]) => mockGetSupabaseServerForRequest(...args),
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
    mockGetSupabaseServerForRequest.mockReset().mockReturnValue(supabase);
    mockWebPushSendNotification.mockReset().mockResolvedValue(undefined);
    fromByTable.clear();
    fromByTable.set('user', makeChain({ data: activeUsers, error: null }));
    fromByTable.set('admin_notification_previews', makeChain({ data: { id: campaignId, expires_at: '2026-11-02T23:40:00.000Z' }, error: null }));
    fromByTable.set('admin_notification_campaigns', makeChain({ data: { id: campaignId, title: 'Update', message: 'Details', level: 'info', deep_link: null, push_requested: false }, error: null }));
    mockFrom.mockImplementation((table: string) => fromByTable.get(table) || makeChain());
  });

  const post = async (body: Record<string, unknown>, authorization?: string) => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/notifications+api');
    return POST(new Request('https://api.hashpass.tech/api/admin/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
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

  it('stores the selected schedule and optional expiry with the audience preview', async () => {
    const scheduledAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const expiresAt = new Date(Date.parse(scheduledAt) + 3 * 60 * 60_000).toISOString();
    const response = await post({ action: 'preview', ...baseDraft, audience: 'all_active', scheduledAt, expiresAt });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { scheduledAt, notificationExpiresAt: expiresAt } });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      scheduled_at: scheduledAt,
      notification_expires_at: expiresAt,
    }));
  });

  it('rejects an expiry that is not later than the scheduled send', async () => {
    const scheduledAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const expiresAt = new Date(Date.parse(scheduledAt) - 60_000).toISOString();
    const response = await post({ action: 'preview', ...baseDraft, audience: 'all_active', scheduledAt, expiresAt });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'Expiry must be later than the scheduled send time.' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('explains when the notification preview table is missing from the local database', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fromByTable.set('admin_notification_previews', makeChain({ data: null, error: { code: 'PGRST205', message: 'table missing from schema cache' } }));
    try {
      const response = await post({ action: 'preview', ...baseDraft, audience: 'all_active' });
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: expect.stringContaining('database migrations are missing') });
    } finally {
      consoleError.mockRestore();
    }
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

  it('queues test push work without calling a provider inside the admin request', async () => {
    mockRpc.mockResolvedValueOnce({ data: { campaign_id: campaignId, recipient_count: 1, push_device_count: 3 }, error: null });
    const response = await post({ action: 'test', ...baseDraft, pushRequested: true, selectedUserIds: [userB] });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { inAppSent: 1, pushRequested: true, pushQueued: 3 } });
    expect(mockWebPushSendNotification).not.toHaveBeenCalled();
  });

  it('rejects scheduled dispatch without the runner token', async () => {
    mockRpc.mockReset();
    const response = await post({ action: 'dispatch' });
    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockAuthorizeGlobalAdmin).not.toHaveBeenCalled();
  });

  it('processes a bounded push batch and records provider results through the worker RPC', async () => {
    const oldToken = readTestEnv('MARKETING_RUNNER_TOKEN');
    const oldPublic = readTestEnv('WEB_PUSH_VAPID_PUBLIC_KEY');
    const oldPrivate = readTestEnv('WEB_PUSH_VAPID_PRIVATE_KEY');
    const oldSubject = readTestEnv('WEB_PUSH_VAPID_SUBJECT');
    const token = 'notification-runner-token-at-least-32-chars';
    const endpoint = 'https://fcm.googleapis.com/fcm/send/browser-endpoint';
    writeTestEnv('MARKETING_RUNNER_TOKEN', token);
    writeTestEnv('WEB_PUSH_VAPID_PUBLIC_KEY', 'test-public-key');
    writeTestEnv('WEB_PUSH_VAPID_PRIVATE_KEY', 'test-private-key');
    writeTestEnv('WEB_PUSH_VAPID_SUBJECT', 'mailto:support@hashpass.app');
    mockRpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: {
        claim_token: '66666666-6666-4666-8666-666666666666',
        campaign_id: campaignId,
        title: 'Update', message: 'Details', level: 'info', deep_link: null, expires_at: null,
        jobs: [{ id: notificationId, user_id: userB, token_id: userA, token: endpoint, platform: 'web', subscription: { endpoint, keys: { p256dh: 'key', auth: 'secret' } } }],
      }, error: null })
      .mockResolvedValueOnce({ data: { acknowledged: 1 }, error: null });
    mockWebPushSendNotification.mockResolvedValueOnce(undefined);

    try {
      const response = await post({ action: 'dispatch' }, `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ data: { claimed: true, pushDevicesClaimed: 1, pushSent: 1 } });
      expect(mockRpc).toHaveBeenNthCalledWith(2, 'admin_claim_notification_push_batch', { p_limit: 20 });
      expect(mockRpc).toHaveBeenNthCalledWith(3, 'admin_ack_notification_push_batch', expect.objectContaining({
        p_claim_token: '66666666-6666-4666-8666-666666666666',
        p_results: [{ id: notificationId, status: 'sent' }],
      }));
      expect(mockWebPushSendNotification).toHaveBeenCalledTimes(1);
    } finally {
      writeTestEnv('MARKETING_RUNNER_TOKEN', oldToken);
      writeTestEnv('WEB_PUSH_VAPID_PUBLIC_KEY', oldPublic);
      writeTestEnv('WEB_PUSH_VAPID_PRIVATE_KEY', oldPrivate);
      writeTestEnv('WEB_PUSH_VAPID_SUBJECT', oldSubject);
    }
  });

  it('consumes an approved preview once for an audience send', async () => {
    mockRpc.mockResolvedValueOnce({ data: { campaign_id: campaignId, recipient_count: 2, push_requested: false, push_device_count: 0 }, error: null });
    const response = await post({ action: 'send', previewId: campaignId });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { campaignId, recipients: 2, inAppSent: 2 } });
    expect(mockRpc).toHaveBeenCalledWith('admin_send_notification_preview', { p_actor_id: actorId, p_preview_id: campaignId });
  });

  it('stores a future send as scheduled without delivering early', async () => {
    const scheduledAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
    const expiresAt = new Date(Date.parse(scheduledAt) + 4 * 60 * 60_000).toISOString();
    mockRpc.mockResolvedValueOnce({ data: {
      campaign_id: campaignId, recipient_count: 2, scheduled: true,
      scheduled_at: scheduledAt, expires_at: expiresAt, push_requested: true, push_device_count: 0,
    }, error: null });
    const response = await post({ action: 'send', previewId: campaignId });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { campaignId, scheduled: true, scheduledAt, expiresAt, inAppSent: 0 } });
    expect(mockRpc).toHaveBeenCalledWith('admin_send_notification_preview', { p_actor_id: actorId, p_preview_id: campaignId });
    expect(mockWebPushSendNotification).not.toHaveBeenCalled();
  });
});
