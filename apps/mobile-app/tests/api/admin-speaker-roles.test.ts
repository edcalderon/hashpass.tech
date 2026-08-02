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

describe('/api/admin/speaker-roles', () => {
  const actorId = '7f60f5d2-5948-4df1-9670-2f9177cf2fe4';

  beforeEach(() => {
    jest.resetModules();
    mockAuthorizeEventAdmin.mockReset();
    mockRpc.mockReset();
    mockFrom.mockReset();
    mockRateLimitOk.mockReturnValue(true);
    mockAuthorizeEventAdmin.mockResolvedValue({
      userId: actorId,
      supabase: {
        rpc: (...args: unknown[]) => mockRpc(...args),
        from: (...args: unknown[]) => mockFrom(...args),
      },
    });
  });

  const post = async (body: Record<string, unknown>) => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/speaker-roles+api');
    return POST(new Request('https://api.hashpass.tech/api/admin/speaker-roles', {
      method: 'POST',
      body: JSON.stringify(body),
    }));
  };

  const get = async (eventId: string) => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/admin/speaker-roles+api');
    return GET(new Request(`https://api.hashpass.tech/api/admin/speaker-roles?eventId=${encodeURIComponent(eventId)}`));
  };

  it('validates mutations before authorizing or mutating speaker access', async () => {
    expect((await post({ action: 'grant', eventId: '../bsl', speakerId: 'edward-calderon', targetEmail: 'edward@hashpass.app' })).status).toBe(400);
    expect((await post({ action: 'grant', eventId: 'chile2026', speakerId: 'edward-calderon', targetEmail: 'not-an-email' })).status).toBe(400);
    expect((await post({ action: 'unknown', eventId: 'chile2026', speakerId: 'edward-calderon' })).status).toBe(400);
    expect(mockAuthorizeEventAdmin).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('uses the event-scoped actor and normalized email for a speaker grant', async () => {
    mockRpc.mockResolvedValue({ data: { speaker_id: 'edward-calderon', action: 'grant', is_active: true }, error: null });

    const response = await post({
      action: 'grant',
      eventId: 'chile2026',
      speakerId: 'edward-calderon',
      targetEmail: ' Edward@Hashpass.App ',
    });

    expect(response.status).toBe(200);
    expect(mockAuthorizeEventAdmin).toHaveBeenCalledWith(expect.any(Request), 'chile2026');
    expect(mockRpc).toHaveBeenCalledWith('admin_manage_speaker_role', {
      p_actor_user_id: actorId,
      p_event_id: 'chile2026',
      p_action: 'grant',
      p_speaker_id: 'edward-calderon',
      p_target_email: 'edward@hashpass.app',
    });
  });

  it.each([
    ['42501', 403, 'Forbidden'],
    ['22023', 400, 'No account exists for this email'],
    ['23505', 409, 'This speaker is already assigned to another account; revoke it first'],
    ['XX000', 500, 'Unable to update speaker access'],
  ])('maps RPC error %s to a safe response', async (code, status, message) => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValue({ data: null, error: { code, message } });

    const response = await post({ action: 'activate', eventId: 'chile2026', speakerId: 'edward-calderon' });

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: message });
    errorSpy.mockRestore();
  });

  it('returns an authorization response without touching the RPC', async () => {
    mockAuthorizeEventAdmin.mockResolvedValue({
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await post({ action: 'revoke', eventId: 'chile2026', speakerId: 'edward-calderon' });
    expect(response.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rate limits before authorization for reads and mutations', async () => {
    mockRateLimitOk.mockReturnValue(false);
    expect((await get('chile2026')).status).toBe(429);
    expect((await post({ action: 'revoke', eventId: 'chile2026', speakerId: 'edward-calderon' })).status).toBe(429);
    expect(mockAuthorizeEventAdmin).not.toHaveBeenCalled();
  });

  it('lists claim metadata only for an authorized event administrator', async () => {
    const claimIn = jest.fn().mockResolvedValue({
      data: [{ speaker_id: 'edward-calderon', email_normalized: 'edward@hashpass.app', status: 'claimed', claimed_user_id: actorId, claim_error: null }],
      error: null,
    });
    const claimSelect = jest.fn(() => ({ in: claimIn }));
    const speakerLimit = jest.fn().mockResolvedValue({
      data: [{ id: 'edward-calderon', name: 'Edward Calderón', title: 'Founder', company: 'Hashpass', imageurl: null, user_id: actorId, is_active: true, is_accepting_meetings: true }],
      error: null,
    });
    const speakerOrder = jest.fn(() => ({ limit: speakerLimit }));
    const speakerSelect = jest.fn(() => ({ order: speakerOrder }));
    mockFrom.mockImplementation((table: string) => table === 'bsl_speakers'
      ? { select: speakerSelect }
      : { select: claimSelect });

    const response = await get('chile2026');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [expect.objectContaining({
        id: 'edward-calderon',
        userId: actorId,
        isActive: true,
        claim: expect.objectContaining({ email_normalized: 'edward@hashpass.app' }),
      })],
    });
    expect(mockFrom).toHaveBeenCalledWith('speaker_identity_claims');
    expect(claimIn).toHaveBeenCalledWith('speaker_id', ['edward-calderon']);
  });
});
