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

  const get = async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/admin/notifications+api');
    return GET(new Request('https://api.hashpass.tech/api/admin/notifications'));
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

  it('rate limits before parsing a request and rejects malformed JSON', async () => {
    mockRateLimitOk.mockReturnValueOnce(false);
    const limited = await post({ action: 'search', query: 'user' });
    expect(limited.status).toBe(429);
    expect(mockAuthorizeGlobalAdmin).not.toHaveBeenCalled();

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/notifications+api');
    const malformed = await POST(new Request('https://api.hashpass.tech/api/admin/notifications', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{',
    }));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: 'A JSON body is required' });
  });

  it('loads campaign history and reports authorization or database errors', async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { id: campaignId, title: 'Update' } });
    expect(mockFrom).toHaveBeenCalledWith('admin_notification_campaigns');

    mockAuthorizeGlobalAdmin.mockResolvedValueOnce({ response: Response.json({ error: 'Forbidden' }, { status: 403 }) });
    expect((await get()).status).toBe(403);

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fromByTable.set('admin_notification_campaigns', makeChain({ data: null, error: { message: 'database unavailable' } }));
    try {
      const failed = await get();
      expect(failed.status).toBe(500);
      expect(await failed.json()).toMatchObject({ error: 'Unable to load notification history' });
    } finally {
      consoleError.mockRestore();
    }
  });

  it('searches only active linked accounts and returns an empty result for short queries', async () => {
    const short = await post({ action: 'search', query: 'x' });
    expect(await short.json()).toEqual({ data: [] });
    expect(mockFrom).not.toHaveBeenCalled();

    fromByTable.set('user', makeChain({ data: [
      { ...activeUsers[0], email: '  ONE@Example.com  ', full_name: '  One User  ' },
      { email: 'unlinked@example.com', provider_ids: {} },
      { email: 'missing@example.com', provider_ids: { supabase: 'not-a-uuid' } },
    ], error: null }));
    const response = await post({ action: 'search', query: ' one%_, ' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [{ id: userA, email: 'one@example.com', name: 'One User' }] });
  });

  it('returns a controlled search error when the registry query fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fromByTable.set('user', makeChain({ data: null, error: { message: 'database unavailable' } }));
    try {
      const response = await post({ action: 'search', query: 'user' });
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ error: 'Unable to search active users' });
    } finally {
      consoleError.mockRestore();
    }
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

  it('validates notification content, audience ids, and timezone-qualified timing', async () => {
    for (const draft of [
      { ...baseDraft, title: '  ' },
      { ...baseDraft, level: 'critical' },
      { ...baseDraft, deepLink: '/settings/security' },
    ]) {
      expect((await post({ action: 'preview', ...draft, audience: 'all_active' })).status).toBe(400);
    }
    expect((await post({ action: 'preview', ...baseDraft, audience: 'unknown' })).status).toBe(400);
    expect((await post({ action: 'preview', ...baseDraft, audience: 'all_active', scheduledAt: '2026-11-02T10:00' })).status).toBe(400);
    expect((await post({ action: 'preview', ...baseDraft, audience: 'all_active', expiresAt: 'not-a-date' })).status).toBe(400);
    expect((await post({ action: 'preview', ...baseDraft, audience: 'all_active', scheduledAt: new Date(Date.now() - 1000).toISOString() })).status).toBe(400);
    expect((await post({ action: 'preview', ...baseDraft, audience: 'selected', selectedUserIds: ['invalid'] })).status).toBe(400);
    expect((await post({ action: 'preview', ...baseDraft, audience: 'event_attendees', eventId: 'unknown' })).status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('targets only selected active recipients and records their count in the audience snapshot', async () => {
    const response = await post({ action: 'preview', ...baseDraft, audience: 'selected', selectedUserIds: [userB, userB] });
    expect(response.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      audience: { type: 'selected', selectedCount: 1 },
      recipient_ids: [userB],
    }));
  });

  it('filters speaker and event attendee rows to active linked users', async () => {
    fromByTable.set('bsl_speakers', makeChain({ data: [
      { user_id: userA }, { user_id: userA }, { user_id: 'not-a-uuid' }, { user_id: userB },
    ], error: null }));
    const speakers = await post({ action: 'preview', ...baseDraft, audience: 'speakers' });
    expect(speakers.status).toBe(200);
    expect(mockInsert).toHaveBeenLastCalledWith(expect.objectContaining({
      audience: { type: 'speakers' }, recipient_ids: [userA, userB],
    }));

    fromByTable.set('passes', makeChain({ data: [
      { user_id: userB, tier: 'general' }, { user_id: 'not-a-uuid', tier: 'general' },
    ], error: null }));
    const attendees = await post({ action: 'preview', ...baseDraft, audience: 'event_attendees', eventId: 'bsl', passTier: 'general' });
    expect(attendees.status).toBe(200);
    expect(mockEq).toHaveBeenCalledWith('event_id', 'colombia2026');
    expect(mockEq).toHaveBeenCalledWith('tier', 'general');
    expect(mockInsert).toHaveBeenLastCalledWith(expect.objectContaining({
      audience: { type: 'event_attendees', eventId: 'bsl', passTier: 'general' }, recipient_ids: [userB],
    }));
  });

  it('reports empty or unavailable registries and audience queries', async () => {
    fromByTable.set('user', makeChain({ data: [{ email: 'unlinked@example.com', provider_ids: {} }], error: null }));
    expect((await post({ action: 'preview', ...baseDraft, audience: 'all_active' })).status).toBe(400);

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      fromByTable.set('user', makeChain({ data: null, error: { message: 'registry unavailable' } }));
      expect((await post({ action: 'preview', ...baseDraft, audience: 'all_active' })).status).toBe(500);
      fromByTable.set('user', makeChain({ data: activeUsers, error: null }));
      fromByTable.set('bsl_speakers', makeChain({ data: null, error: { message: 'speaker table unavailable' } }));
      expect((await post({ action: 'preview', ...baseDraft, audience: 'speakers' })).status).toBe(500);
      fromByTable.set('passes', makeChain({ data: null, error: { message: 'passes unavailable' } }));
      expect((await post({ action: 'preview', ...baseDraft, audience: 'event_attendees', eventId: 'colombia2026' })).status).toBe(500);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('counts push devices in the preview and returns a controlled error on count failure', async () => {
    fromByTable.set('notification_push_tokens', makeChain({ data: null, error: null, count: 4 }));
    const success = await post({ action: 'preview', ...baseDraft, audience: 'all_active', pushRequested: true });
    expect(success.status).toBe(200);
    expect(await success.json()).toMatchObject({ data: { pushTokenCount: 4 } });

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fromByTable.set('notification_push_tokens', makeChain({ data: null, error: { message: 'count unavailable' } }));
    try {
      const failure = await post({ action: 'preview', ...baseDraft, audience: 'all_active', pushRequested: true });
      expect(failure.status).toBe(500);
      expect(await failure.json()).toMatchObject({ error: 'Unable to preview registered push devices' });
    } finally {
      consoleError.mockRestore();
    }
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

  it('distinguishes permission and preview-write failures from a missing migration', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      fromByTable.set('admin_notification_previews', makeChain({ data: null, error: { code: '42501', message: 'permission denied' } }));
      const denied = await post({ action: 'preview', ...baseDraft, audience: 'all_active' });
      expect(denied.status).toBe(500);
      expect(await denied.json()).toMatchObject({ error: 'Unable to save this audience preview' });

      fromByTable.set('admin_notification_previews', makeChain({ data: { expires_at: 'later' }, error: null }));
      const missingId = await post({ action: 'preview', ...baseDraft, audience: 'all_active' });
      expect(missingId.status).toBe(500);
      expect(await missingId.json()).toMatchObject({ error: 'Unable to save this audience preview' });

      fromByTable.set('admin_notification_previews', makeChain({ data: null, error: { code: 'XX000', message: 'admin_notification_previews write failed' } }));
      const namedTable = await post({ action: 'preview', ...baseDraft, audience: 'all_active' });
      expect(namedTable.status).toBe(503);
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

  it('validates test recipients and reports campaign creation failures', async () => {
    expect((await post({ action: 'test', ...baseDraft, selectedUserIds: [] })).status).toBe(400);
    expect((await post({ action: 'test', ...baseDraft, selectedUserIds: [userB], expiresAt: 'not-a-date' })).status).toBe(400);
    expect((await post({ action: 'test', ...baseDraft, selectedUserIds: [userB], expiresAt: new Date(Date.now() - 60_000).toISOString() })).status).toBe(400);

    const inactive = await post({ action: 'test', ...baseDraft, selectedUserIds: ['66666666-6666-4666-8666-666666666666'] });
    expect(inactive.status).toBe(400);
    expect(await inactive.json()).toMatchObject({ error: 'Every test recipient must be an active linked account' });

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'campaign table unavailable' } });
    try {
      const failed = await post({ action: 'test', ...baseDraft, selectedUserIds: [userB] });
      expect(failed.status).toBe(500);
      expect(await failed.json()).toMatchObject({ error: 'Unable to create the notification campaign' });
    } finally {
      consoleError.mockRestore();
    }
  });

  it('reports notification queue counts and skipped push delivery from the stored campaign result', async () => {
    mockRpc.mockResolvedValueOnce({ data: { campaign_id: campaignId, recipient_count: 2, push_device_count: 0 }, error: null });
    const response = await post({ action: 'test', ...baseDraft, selectedUserIds: [userA], pushRequested: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { recipients: 2, pushQueued: 0, pushSkipped: 1, pushSent: 0, pushFailed: 0 } });
  });

  it('rejects scheduled dispatch without the runner token', async () => {
    mockRpc.mockReset();
    const response = await post({ action: 'dispatch' });
    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockAuthorizeGlobalAdmin).not.toHaveBeenCalled();
  });

  it('handles empty scheduled worker batches and queue/RPC failures', async () => {
    const oldToken = readTestEnv('MARKETING_RUNNER_TOKEN');
    const token = 'notification-runner-token-at-least-32-chars';
    writeTestEnv('MARKETING_RUNNER_TOKEN', token);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      mockRpc.mockResolvedValueOnce({ data: { campaign_id: campaignId }, error: null })
        .mockResolvedValueOnce({ data: null, error: null });
      const empty = await post({ action: 'dispatch' }, `Bearer ${token}`);
      expect(empty.status).toBe(200);
      expect(await empty.json()).toMatchObject({ data: { claimed: true, scheduledCampaignClaimed: true, pushDevicesClaimed: 0 } });

      mockRpc.mockReset().mockResolvedValueOnce({ data: null, error: { message: 'scheduled queue failed' } });
      expect((await post({ action: 'dispatch' }, `Bearer ${token}`)).status).toBe(503);

      mockRpc.mockReset().mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: { message: 'push queue failed' } });
      expect((await post({ action: 'dispatch' }, `Bearer ${token}`)).status).toBe(503);

      mockRpc.mockReset().mockRejectedValueOnce(new Error('database unavailable'));
      expect((await post({ action: 'dispatch' }, `Bearer ${token}`)).status).toBe(503);
    } finally {
      consoleError.mockRestore();
      writeTestEnv('MARKETING_RUNNER_TOKEN', oldToken);
    }
  });

  it('rejects incomplete push batch acknowledgements and acknowledges unsupported devices as failed', async () => {
    const oldToken = readTestEnv('MARKETING_RUNNER_TOKEN');
    const token = 'notification-runner-token-at-least-32-chars';
    writeTestEnv('MARKETING_RUNNER_TOKEN', token);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      mockRpc.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: {
        claim_token: '66666666-6666-4666-8666-666666666666', jobs: [{ id: notificationId, platform: 'other', token: 'x' }],
      }, error: null }).mockResolvedValueOnce({ data: { acknowledged: 0 }, error: null });
      const response = await post({ action: 'dispatch' }, `Bearer ${token}`);
      expect(response.status).toBe(503);
      expect(mockRpc).toHaveBeenNthCalledWith(3, 'admin_ack_notification_push_batch', expect.objectContaining({
        p_results: [{ id: notificationId, status: 'failed', error: 'Unsupported push device.' }],
      }));

      mockRpc.mockReset().mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: {
        claim_token: '66666666-6666-4666-8666-666666666666', jobs: [],
      }, error: null }).mockResolvedValueOnce({ data: null, error: { message: 'ack failed' } });
      expect((await post({ action: 'dispatch' }, `Bearer ${token}`)).status).toBe(503);
    } finally {
      consoleError.mockRestore();
      writeTestEnv('MARKETING_RUNNER_TOKEN', oldToken);
    }
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

  it('marks unconfigured and invalid browser subscriptions failed, and retries transient provider errors', async () => {
    const oldToken = readTestEnv('MARKETING_RUNNER_TOKEN');
    const oldPublic = readTestEnv('WEB_PUSH_VAPID_PUBLIC_KEY');
    const oldPrivate = readTestEnv('WEB_PUSH_VAPID_PRIVATE_KEY');
    const oldSubject = readTestEnv('WEB_PUSH_VAPID_SUBJECT');
    const token = 'notification-runner-token-at-least-32-chars';
    const endpoint = 'https://fcm.googleapis.com/fcm/send/browser-endpoint';
    const claimToken = '66666666-6666-4666-8666-666666666666';
    const jobs = [
      { id: 'invalid-subscription', token: endpoint, platform: 'web', subscription: { endpoint: 'https://wrong.example' } },
      { id: 'expired-device', token: endpoint, platform: 'web', subscription: { endpoint } },
      { id: 'temporary-error', token: endpoint, platform: 'web', subscription: { endpoint } },
    ];
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    writeTestEnv('MARKETING_RUNNER_TOKEN', token);
    try {
      writeTestEnv('WEB_PUSH_VAPID_PUBLIC_KEY', undefined);
      writeTestEnv('WEB_PUSH_VAPID_PRIVATE_KEY', undefined);
      writeTestEnv('WEB_PUSH_VAPID_SUBJECT', undefined);
      mockRpc.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: {
        claim_token: claimToken, title: 'Update', message: 'Details', level: 'info', jobs: [jobs[0]],
      }, error: null }).mockResolvedValueOnce({ data: { acknowledged: 1 }, error: null });
      const unconfigured = await post({ action: 'dispatch' }, `Bearer ${token}`);
      expect(unconfigured.status).toBe(200);
      expect(mockRpc).toHaveBeenNthCalledWith(3, 'admin_ack_notification_push_batch', expect.objectContaining({
        p_results: [{ id: 'invalid-subscription', status: 'failed', error: 'Browser push is not configured for this environment.' }],
      }));

      writeTestEnv('WEB_PUSH_VAPID_PUBLIC_KEY', 'public-test-key');
      writeTestEnv('WEB_PUSH_VAPID_PRIVATE_KEY', 'private-test-key');
      writeTestEnv('WEB_PUSH_VAPID_SUBJECT', 'mailto:support@hashpass.app');
      mockWebPushSendNotification
        .mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }))
        .mockRejectedValueOnce(Object.assign(new Error('temporary'), { statusCode: 503 }));
      mockRpc.mockReset().mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: {
        claim_token: claimToken, title: 'Update', message: 'Details', level: 'important', jobs,
      }, error: null }).mockResolvedValueOnce({ data: { acknowledged: 3 }, error: null });
      const transient = await post({ action: 'dispatch' }, `Bearer ${token}`);
      expect(transient.status).toBe(200);
      expect(await transient.json()).toMatchObject({ data: { pushFailed: 2, pushRetried: 1 } });
      expect(mockWebPushSendNotification).toHaveBeenCalledTimes(2);
    } finally {
      consoleError.mockRestore();
      writeTestEnv('MARKETING_RUNNER_TOKEN', oldToken);
      writeTestEnv('WEB_PUSH_VAPID_PUBLIC_KEY', oldPublic);
      writeTestEnv('WEB_PUSH_VAPID_PRIVATE_KEY', oldPrivate);
      writeTestEnv('WEB_PUSH_VAPID_SUBJECT', oldSubject);
    }
  });

  it('handles Expo push acknowledgements, provider rejection, and uncertain gateway responses', async () => {
    const oldToken = readTestEnv('MARKETING_RUNNER_TOKEN');
    const token = 'notification-runner-token-at-least-32-chars';
    const claimToken = '66666666-6666-4666-8666-666666666666';
    const originalFetch = globalThis.fetch;
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    writeTestEnv('MARKETING_RUNNER_TOKEN', token);
    try {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [
          { status: 'ok', id: 'expo-ticket' },
          { status: 'error', details: { error: 'DeviceNotRegistered' } },
        ] }),
      } as Response);
      mockRpc.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: {
        claim_token: claimToken, campaign_id: campaignId, title: 'Update', message: 'Details', level: 'important',
        deep_link: '/dashboard/notifications', jobs: [
          { id: 'expo-ok', token: 'ExponentPushToken[one]', platform: 'android' },
          { id: 'expo-gone', token: 'ExpoPushToken[two]', platform: 'ios' },
        ],
      }, error: null }).mockResolvedValueOnce({ data: { acknowledged: 2 }, error: null });
      const accepted = await post({ action: 'dispatch' }, `Bearer ${token}`);
      expect(accepted.status).toBe(200);
      expect(await accepted.json()).toMatchObject({ data: { pushSent: 1, pushFailed: 1 } });
      expect(fetchSpy).toHaveBeenCalledWith('https://exp.host/--/api/v2/push/send', expect.objectContaining({ method: 'POST' }));

      fetchSpy.mockResolvedValueOnce({ ok: false } as Response);
      mockRpc.mockReset().mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: {
        claim_token: claimToken, title: 'Update', message: 'Details', level: 'info',
        jobs: [{ id: 'expo-unknown', token: 'ExpoPushToken[three]', platform: 'android' }],
      }, error: null }).mockResolvedValueOnce({ data: { acknowledged: 1 }, error: null });
      const uncertain = await post({ action: 'dispatch' }, `Bearer ${token}`);
      expect(uncertain.status).toBe(200);
      expect(await uncertain.json()).toMatchObject({ data: { pushRetried: 1 } });
    } finally {
      fetchSpy.mockRestore();
      globalThis.fetch = originalFetch;
      consoleError.mockRestore();
      writeTestEnv('MARKETING_RUNNER_TOKEN', oldToken);
    }
  });

  it('validates send preview ids and maps expired, stale, scheduled, and generic send failures', async () => {
    expect((await post({ action: 'send', previewId: 'bad-id' })).status).toBe(400);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      for (const message of ['preview expired', 'already used', 'preview not found']) {
        mockRpc.mockReset().mockResolvedValueOnce({ data: null, error: { message } });
        const response = await post({ action: 'send', previewId: campaignId });
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ error: 'The preview expired or was already used. Preview again.' });
      }
      mockRpc.mockReset().mockResolvedValueOnce({ data: null, error: { message: 'scheduled time must be in the future' } });
      const lateSchedule = await post({ action: 'send', previewId: campaignId });
      expect(lateSchedule.status).toBe(409);
      expect(await lateSchedule.json()).toMatchObject({ error: 'The scheduled time has passed. Preview again and choose a future time.' });

      mockRpc.mockReset().mockResolvedValueOnce({ data: null, error: { message: 'database unavailable' } });
      expect((await post({ action: 'send', previewId: campaignId })).status).toBe(500);

      mockRpc.mockReset().mockResolvedValueOnce({ data: { campaign_id: campaignId, recipient_count: 0, push_requested: true, push_device_count: 0 }, error: null });
      const sent = await post({ action: 'send', previewId: campaignId });
      expect(sent.status).toBe(200);
      expect(await sent.json()).toMatchObject({ data: { inAppSent: 0, pushSkipped: 0 } });
    } finally {
      consoleError.mockRestore();
    }
  });

  it('rejects unsupported admin notification actions', async () => {
    const response = await post({ action: 'unknown' });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'Unsupported notification action' });
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
