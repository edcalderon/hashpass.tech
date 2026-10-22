/// <reference types="jest" />

const mockResolveNotificationIdentity = jest.fn();
const mockRpc = jest.fn();
const mockAuthorizeEventAdmin = jest.fn();
const mockRateLimitOk = jest.fn((_key: string) => true);
const mockGenerateLink = jest.fn();
const mockSendCriticalEmail = jest.fn();
const mockSendMagicLink = jest.fn();

jest.mock('@/lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: (...args: unknown[]) => mockResolveNotificationIdentity(...args),
  isResolveIdentityError: (value: { status?: unknown }) => typeof value?.status === 'number',
}));
jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: { admin: { generateLink: (...args: unknown[]) => mockGenerateLink(...args) } },
  }),
}));
jest.mock('@/lib/email', () => ({
  sendCriticalNotificationEmail: (...args: unknown[]) => mockSendCriticalEmail(...args),
  sendAuthenticationMagicLink: (...args: unknown[]) => mockSendMagicLink(...args),
}));
jest.mock('@/lib/auth/magic-link-request', () => ({
  normalizeMagicLinkRedirect: (value: unknown) =>
    typeof value === 'string' && value.startsWith('https://hashpass.tech/auth/callback') ? value : null,
}));
jest.mock('@/lib/server/event-admin', () => ({
  authorizeEventAdmin: (...args: unknown[]) => mockAuthorizeEventAdmin(...args),
}));
jest.mock('@/lib/bsl/rateLimit', () => ({
  rateLimitOk: (key: string) => mockRateLimitOk(key),
}));

describe('/api/speakers/claims', () => {
  const userId = '7f60f5d2-5948-4df1-9670-2f9177cf2fe4';
  const otherUserId = '9a60f5d2-5948-4df1-9670-2f9177cf2fe5';
  const note = 'I am speaking at BSL Colombia and this is my account.';

  beforeEach(() => {
    jest.resetModules();
    mockResolveNotificationIdentity.mockReset();
    mockRpc.mockReset();
    mockGenerateLink.mockReset();
    mockSendCriticalEmail.mockReset();
    mockSendMagicLink.mockReset();
    mockRateLimitOk.mockReturnValue(true);
    mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: userId });
    mockRpc.mockResolvedValue({ data: { status: 'pending', claim_id: '11111111-1111-4111-8111-111111111111' }, error: null });
    mockSendCriticalEmail.mockResolvedValue({ success: true });
    mockSendMagicLink.mockResolvedValue({ success: true });
    mockGenerateLink.mockResolvedValue({
      data: {
        user: { id: otherUserId },
        properties: { hashed_token: 'hash-1', verification_type: 'magiclink' },
      },
      error: null,
    });
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
      body: JSON.stringify({ eventId: 'colombia2026', speakerId: 'speaker-1', note }),
    }));

    expect(response.status).toBe(200);
    expect(mockResolveNotificationIdentity).toHaveBeenLastCalledWith(
      expect.any(Request),
      'core-production',
    );
    expect(mockRpc).toHaveBeenCalledWith('submit_speaker_profile_claim', {
      p_speaker_id: 'speaker-1',
      p_submitted_by: userId,
      p_claimant_user_id: userId,
      p_claim_mode: 'current_email',
      p_claim_email: null,
      p_note: note,
    });
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  it('requires an explanatory note for the current-email claim', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/speakers/claims+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/speakers/claims', {
      method: 'POST',
      body: JSON.stringify({ eventId: 'colombia2026', speakerId: 'speaker-1', note: 'too short' }),
    }));

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('emails every reviewer that was notified in-app for a new claim', async () => {
    mockRpc.mockResolvedValue({
      data: {
        created: true,
        speaker_name: 'Ada Lovelace',
        claim_email: 'ada@example.test',
        request_note: note,
        reviewer_ids: ['r1', 'r2'],
      },
      error: null,
    });
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/speakers/claims+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/speakers/claims', {
      method: 'POST',
      body: JSON.stringify({ eventId: 'colombia2026', speakerId: 'speaker-1', note }),
    }));

    expect(response.status).toBe(200);
    expect(mockSendCriticalEmail).toHaveBeenCalledTimes(2);
    expect(mockSendCriticalEmail).toHaveBeenCalledWith(expect.objectContaining({
      recipientUserId: 'r1',
      notificationType: 'speaker_claim_review_required',
      speakerName: 'Ada Lovelace',
      eventId: 'colombia2026',
    }));
  });

  it('does not email reviewers when the claim already existed', async () => {
    mockRpc.mockResolvedValue({ data: { created: false, reviewer_ids: ['r1'] }, error: null });
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/speakers/claims+api');
    await POST(new Request('https://api.hashpass.tech/api/speakers/claims', {
      method: 'POST',
      body: JSON.stringify({ eventId: 'colombia2026', speakerId: 'speaker-1', note }),
    }));

    expect(mockSendCriticalEmail).not.toHaveBeenCalled();
  });

  describe('other email', () => {
    const redirectTo = 'https://hashpass.tech/auth/callback?returnTo=%2Fevents%2Fcolombia2026%2Fspeakers%2Fspeaker-1%3FclaimVerify%3D1';
    const otherBody = (overrides: Record<string, unknown> = {}) => JSON.stringify({
      eventId: 'colombia2026',
      speakerId: 'speaker-1',
      mode: 'other_email',
      claimEmail: 'Ada@Work.test',
      note,
      redirectTo,
      locale: 'es',
      ...overrides,
    });
    const post = async (body: string) => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { POST } = require('../../app/api/speakers/claims+api');
      return POST(new Request('https://api.hashpass.tech/api/speakers/claims', { method: 'POST', body }));
    };

    it('creates an unconfirmed account, files the claim as pending and mails one verification link', async () => {
      mockRpc.mockResolvedValue({ data: { verification_status: 'pending', created: true, reviewer_ids: [] }, error: null });
      const response = await post(otherBody());

      expect(response.status).toBe(200);
      expect(mockGenerateLink).toHaveBeenCalledWith(expect.objectContaining({ type: 'magiclink', email: 'ada@work.test' }));
      expect(mockRpc).toHaveBeenCalledWith('submit_speaker_profile_claim', expect.objectContaining({
        p_submitted_by: userId,
        p_claimant_user_id: otherUserId,
        p_claim_mode: 'other_email',
        p_claim_email: 'ada@work.test',
      }));
      expect(mockSendMagicLink).toHaveBeenCalledTimes(1);
      const sent = mockSendMagicLink.mock.calls[0][0];
      expect(sent.email).toBe('ada@work.test');
      expect(sent.locale).toBe('es');
      expect(new URL(sent.actionLink).hash).toBe('#token_hash=hash-1&type=magiclink');
      // Reviewers are alerted only after the inbox is verified.
      expect(mockSendCriticalEmail).not.toHaveBeenCalled();
    });

    it.each([
      ['a short note', { note: 'short' }],
      ['an invalid email', { claimEmail: 'nope' }],
      ['an unsafe callback', { redirectTo: 'https://evil.test/auth/callback' }],
      ['an unsupported mode', { mode: 'phone' }],
    ])('rejects %s before any account is created', async (_label, overrides) => {
      const response = await post(otherBody(overrides));

      expect(response.status).toBe(400);
      expect(mockGenerateLink).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('throttles repeated link requests for the same address', async () => {
      mockRateLimitOk.mockImplementation((key: string) => !key.startsWith('speaker-claim-email:'));
      const response = await post(otherBody());

      expect(response.status).toBe(429);
      expect(mockGenerateLink).not.toHaveBeenCalled();
    });

    it('fails with a bad gateway when the account or link cannot be created', async () => {
      mockGenerateLink.mockResolvedValue({ data: null, error: { message: 'smtp down' } });
      const response = await post(otherBody());

      expect(response.status).toBe(502);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('does not send a link for a claim that is already verified', async () => {
      mockRpc.mockResolvedValue({ data: { verification_status: 'verified', created: false }, error: null });
      const response = await post(otherBody());

      expect(response.status).toBe(200);
      expect(mockSendMagicLink).not.toHaveBeenCalled();
    });

    it('reports a bad gateway when the verification email fails to send', async () => {
      mockRpc.mockResolvedValue({ data: { verification_status: 'pending', created: true }, error: null });
      mockSendMagicLink.mockResolvedValue({ success: false });
      const response = await post(otherBody());

      expect(response.status).toBe(502);
    });

    it('reports 503 while the claim migration is not applied', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'missing' } });
      const response = await post(otherBody());

      expect(response.status).toBe(503);
      expect(mockSendMagicLink).not.toHaveBeenCalled();
    });

    it('maps other RPC errors through the claim error contract', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'already linked' } });
      const response = await post(otherBody());

      expect(response.status).toBe(409);
    });
  });

  describe('verification (PATCH)', () => {
    const patch = async (body: string) => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require('../../app/api/speakers/claims+api');
      return PATCH(new Request('https://api.hashpass.tech/api/speakers/claims', { method: 'PATCH', body }));
    };

    it('marks the claim verified for the signed-in account and emails the reviewers', async () => {
      mockRpc.mockResolvedValue({
        data: { created: true, speaker_name: 'Ada Lovelace', claim_email: 'ada@work.test', request_note: note, reviewer_ids: ['r1'] },
        error: null,
      });
      const response = await patch(JSON.stringify({ eventId: 'colombia2026', speakerId: 'speaker-1' }));

      expect(response.status).toBe(200);
      expect(mockRpc).toHaveBeenCalledWith('verify_speaker_claim_email', {
        p_speaker_id: 'speaker-1',
        p_user_id: userId,
      });
      expect(mockSendCriticalEmail).toHaveBeenCalledTimes(1);
    });

    it('validates identifiers, rate limits and authentication', async () => {
      expect((await patch(JSON.stringify({ eventId: 'bad event', speakerId: 'speaker-1' }))).status).toBe(400);
      expect(mockResolveNotificationIdentity).not.toHaveBeenCalled();

      mockResolveNotificationIdentity.mockResolvedValue({ response: Response.json({ error: 'Authentication required' }, { status: 401 }), status: 401 });
      expect((await patch(JSON.stringify({ eventId: 'colombia2026', speakerId: 'speaker-1' }))).status).toBe(401);

      mockRateLimitOk.mockReturnValue(false);
      expect((await patch('{}')).status).toBe(429);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('maps an unverified email to a forbidden response', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'not verified' } });
      const response = await patch(JSON.stringify({ eventId: 'colombia2026', speakerId: 'speaker-1' }));

      expect(response.status).toBe(403);
      expect(mockSendCriticalEmail).not.toHaveBeenCalled();
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
    expect(mockResolveNotificationIdentity).toHaveBeenCalledWith(expect.any(Request), 'core-production');
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
      body: JSON.stringify({ eventId: 'colombia2026', speakerId: 'speaker-1', note }),
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
    mockSendCriticalEmail.mockReset();
    mockSendCriticalEmail.mockResolvedValue({ success: true });
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

  it('emails the claimant the decision and keeps the reviewer note', async () => {
    mockRpc.mockResolvedValue({
      data: {
        requester_user_id: 'claimant-1',
        speaker_name: 'Ada Lovelace',
        status: 'rejected',
        review_note: 'The roster lists a different email.',
      },
      error: null,
    });
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/speaker-claims+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/admin/speaker-claims', {
      method: 'POST',
      body: JSON.stringify({
        eventId: 'colombia2026',
        claimId: '11111111-1111-4111-8111-111111111111',
        action: 'reject',
        reviewNote: 'The roster lists a different email.',
      }),
    }));

    expect(response.status).toBe(200);
    expect(mockSendCriticalEmail).toHaveBeenCalledWith(expect.objectContaining({
      recipientUserId: 'claimant-1',
      notificationType: 'speaker_claim_rejected',
      message: expect.stringContaining('The roster lists a different email.'),
    }));
  });

  it('emails an approval without waiting on delivery failures', async () => {
    mockRpc.mockResolvedValue({
      data: { requester_user_id: 'claimant-1', speaker_name: 'Ada Lovelace', status: 'approved' },
      error: null,
    });
    mockSendCriticalEmail.mockRejectedValue(new Error('smtp down'));
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

    expect(response.status).toBe(200);
    expect(mockSendCriticalEmail).toHaveBeenCalledWith(expect.objectContaining({
      notificationType: 'speaker_claim_approved',
    }));
  });

  it('requires a note when declining so the claimant knows what to fix', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/speaker-claims+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/admin/speaker-claims', {
      method: 'POST',
      body: JSON.stringify({
        eventId: 'colombia2026',
        claimId: '11111111-1111-4111-8111-111111111111',
        action: 'reject',
      }),
    }));

    expect(response.status).toBe(400);
    expect(mockAuthorizeEventAdmin).not.toHaveBeenCalled();
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
