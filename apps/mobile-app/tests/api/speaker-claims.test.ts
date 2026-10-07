/// <reference types="jest" />

const mockResolveNotificationIdentity = jest.fn();
const mockRpc = jest.fn();
const mockAuthorizeEventAdmin = jest.fn();
const mockRateLimitOk = jest.fn((_key: string) => true);

jest.mock('@/lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: (...args: unknown[]) => mockResolveNotificationIdentity(...args),
  isResolveIdentityError: (value: { status?: unknown }) => typeof value?.status === 'number',
}));
jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
}));
jest.mock('@/lib/server/event-admin', () => ({
  authorizeEventAdmin: (...args: unknown[]) => mockAuthorizeEventAdmin(...args),
}));
jest.mock('@/lib/bsl/rateLimit', () => ({
  rateLimitOk: (key: string) => mockRateLimitOk(key),
}));

describe('/api/speakers/claims', () => {
  const userId = '7f60f5d2-5948-4df1-9670-2f9177cf2fe4';

  beforeEach(() => {
    jest.resetModules();
    mockResolveNotificationIdentity.mockReset();
    mockRpc.mockReset();
    mockRateLimitOk.mockReturnValue(true);
    mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: userId });
    mockRpc.mockResolvedValue({ data: { status: 'pending', claim_id: '11111111-1111-4111-8111-111111111111' }, error: null });
  });

  it('requires a signed-in identity before creating a claim request', async () => {
    mockResolveNotificationIdentity.mockResolvedValue({ response: Response.json({ error: 'Authentication required' }, { status: 401 }), status: 401 });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/speakers/claims+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/speakers/claims', {
      method: 'POST',
      body: JSON.stringify({ eventId: 'colombia2026', speakerId: 'speaker-1' }),
    }));

    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('creates a claim request for the exact speaker and authenticated account', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/speakers/claims+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/speakers/claims', {
      method: 'POST',
      body: JSON.stringify({ eventId: 'colombia2026', speakerId: 'speaker-1', note: 'I am speaking at BSL Colombia.' }),
    }));

    expect(response.status).toBe(200);
    expect(mockResolveNotificationIdentity).toHaveBeenLastCalledWith(
      expect.any(Request),
      'bsl-production',
    );
    expect(mockRpc).toHaveBeenCalledWith('request_speaker_profile_claim', {
      p_speaker_id: 'speaker-1',
      p_requester_user_id: userId,
      p_note: 'I am speaking at BSL Colombia.',
    });
  });

  it('rejects rate-limited requests before parsing the claim body', async () => {
    mockRateLimitOk.mockReturnValue(false);
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/speakers/claims+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/speakers/claims', {
      method: 'POST',
      body: '{not-json',
      headers: { 'x-forwarded-for': '198.51.100.12, 10.0.0.1' },
    }));

    expect(response.status).toBe(429);
    expect(mockResolveNotificationIdentity).not.toHaveBeenCalled();
  });

  it('validates the event and speaker identifiers before creating a claim', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/speakers/claims+api');

    const invalidEvent = await POST(new Request('https://api.hashpass.tech/api/speakers/claims', {
      method: 'POST',
      body: JSON.stringify({ eventId: 'not a valid event', speakerId: 'speaker-1' }),
    }));
    expect(invalidEvent.status).toBe(400);
    expect(mockResolveNotificationIdentity).not.toHaveBeenCalled();

    const invalidSpeaker = await POST(new Request('https://api.hashpass.tech/api/speakers/claims', {
      method: 'POST',
      body: JSON.stringify({ eventId: 'colombia2026', speakerId: 'not valid!' }),
    }));
    expect(invalidSpeaker.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects an oversized claim note after authenticating the requester', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/speakers/claims+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/speakers/claims', {
      method: 'POST',
      body: JSON.stringify({ eventId: 'colombia2026', speakerId: 'speaker-1', note: 'x'.repeat(1001) }),
    }));

    expect(response.status).toBe(400);
    expect(mockResolveNotificationIdentity).toHaveBeenCalledWith(expect.any(Request), 'bsl-production');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it.each([
    ['42501', 403],
    ['23505', 409],
    ['22023', 400],
    ['unexpected', 500],
  ])('maps claim RPC error %s to HTTP %s', async (code, status) => {
    mockRpc.mockResolvedValue({ data: null, error: { code, message: 'claim failure' } });
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/speakers/claims+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/speakers/claims', {
      method: 'POST',
      body: JSON.stringify({ eventId: 'colombia2026', speakerId: 'speaker-1' }),
    }));

    expect(response.status).toBe(status);
  });
});

describe('/api/admin/speaker-claims', () => {
  const actorId = '7f60f5d2-5948-4df1-9670-2f9177cf2fe4';

  beforeEach(() => {
    jest.resetModules();
    mockAuthorizeEventAdmin.mockReset();
    mockRpc.mockReset();
    mockRateLimitOk.mockReturnValue(true);
    mockAuthorizeEventAdmin.mockResolvedValue({
      userId: actorId,
      supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
    });
    mockRpc.mockResolvedValue({ data: { claim_id: '11111111-1111-4111-8111-111111111111', status: 'approved' }, error: null });
  });

  it('rejects unsupported review actions before authorizing', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/speaker-claims+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/admin/speaker-claims', {
      method: 'POST',
      body: JSON.stringify({ eventId: 'colombia2026', claimId: '11111111-1111-4111-8111-111111111111', action: 'grant' }),
    }));

    expect(response.status).toBe(400);
    expect(mockAuthorizeEventAdmin).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('reviews a claim through the event-authorized RPC', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/speaker-claims+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/admin/speaker-claims', {
      method: 'POST',
      body: JSON.stringify({
        eventId: 'colombia2026',
        claimId: '11111111-1111-4111-8111-111111111111',
        action: 'approve',
        reviewNote: 'Verified with the BSL speaker roster.',
      }),
    }));

    expect(response.status).toBe(200);
    expect(mockAuthorizeEventAdmin).toHaveBeenCalledWith(expect.any(Request), 'colombia2026');
    expect(mockRpc).toHaveBeenCalledWith('review_speaker_profile_claim', {
      p_actor_user_id: actorId,
      p_claim_id: '11111111-1111-4111-8111-111111111111',
      p_action: 'approve',
      p_review_note: 'Verified with the BSL speaker roster.',
    });
  });

  it('lists claim requests only through the event-authorized admin boundary', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: '11111111-1111-4111-8111-111111111111', status: 'pending' }],
      error: null,
    });
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/admin/speaker-claims+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/admin/speaker-claims?eventId=colombia2026'));

    expect(response.status).toBe(200);
    expect(mockAuthorizeEventAdmin).toHaveBeenCalledWith(expect.any(Request), 'colombia2026');
    expect(mockRpc).toHaveBeenCalledWith('list_speaker_claim_requests', {
      p_actor_user_id: actorId,
      p_event_id: 'colombia2026',
    });
  });

  it('rejects rate-limited and malformed admin requests before authorization', async () => {
    mockRateLimitOk.mockReturnValue(false);
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET, POST } = require('../../app/api/admin/speaker-claims+api');

    const limited = await GET(new Request('https://api.hashpass.tech/api/admin/speaker-claims?eventId=colombia2026'));
    expect(limited.status).toBe(429);
    expect(mockAuthorizeEventAdmin).not.toHaveBeenCalled();

    mockRateLimitOk.mockReturnValue(true);
    const invalidEvent = await GET(new Request('https://api.hashpass.tech/api/admin/speaker-claims?eventId=bad%20event'));
    expect(invalidEvent.status).toBe(400);

    const invalidBody = await POST(new Request('https://api.hashpass.tech/api/admin/speaker-claims', {
      method: 'POST',
      body: '{not-json',
    }));
    expect(invalidBody.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects an oversized review note before authorizing an admin', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/speaker-claims+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/admin/speaker-claims', {
      method: 'POST',
      body: JSON.stringify({
        eventId: 'colombia2026',
        claimId: '11111111-1111-4111-8111-111111111111',
        action: 'approve',
        reviewNote: 'x'.repeat(1001),
      }),
    }));

    expect(response.status).toBe(400);
    expect(mockAuthorizeEventAdmin).not.toHaveBeenCalled();
  });

  it.each([
    ['42501', 403],
    ['40400', 400],
    ['22023', 400],
    ['23505', 409],
    ['unexpected', 500],
  ])('maps admin claim RPC error %s to HTTP %s', async (code, status) => {
    mockRpc.mockResolvedValue({ data: null, error: { code, message: 'review failure' } });
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/speaker-claims+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/admin/speaker-claims', {
      method: 'POST',
      body: JSON.stringify({
        eventId: 'colombia2026',
        claimId: '11111111-1111-4111-8111-111111111111',
        action: 'approve',
      }),
    }));

    expect(response.status).toBe(status);
  });

  it('maps list RPC failures through the same safe error contract', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'list failure' } });
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/admin/speaker-claims+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/admin/speaker-claims?eventId=colombia2026'));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'list failure' });
  });
});
