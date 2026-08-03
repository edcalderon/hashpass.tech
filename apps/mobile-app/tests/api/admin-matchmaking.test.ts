/// <reference types="jest" />

const mockAuthorizeEventAdmin = jest.fn();
const mockListEventAttendees = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockGetUserById = jest.fn();
const mockRateLimitOk = jest.fn((_key: string) => true);
const mockSendMeetingNotificationEmail = jest.fn().mockResolvedValue({ success: true });

jest.mock('@/lib/server/event-admin', () => ({
  authorizeEventAdmin: (...args: unknown[]) => mockAuthorizeEventAdmin(...args),
  listEventAttendees: (...args: unknown[]) => mockListEventAttendees(...args),
}));
jest.mock('@/lib/bsl/rateLimit', () => ({
  rateLimitOk: (key: string) => mockRateLimitOk(key),
}));
jest.mock('@/lib/email', () => ({
  sendMeetingNotificationEmail: (...args: unknown[]) => mockSendMeetingNotificationEmail(...args),
}));

function makeChain(result: { data: unknown; error: unknown } = { data: [], error: null }) {
  const chain: any = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    not: jest.fn(() => chain),
    order: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    insert: jest.fn(() => Promise.resolve(result)),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

describe('/api/admin/matchmaking', () => {
  const actorId = '7f60f5d2-5948-4df1-9670-2f9177cf2fe4';
  const attendeeId = '8f60f5d2-5948-4df1-9670-2f9177cf2fe4';
  const outsiderId = '9f60f5d2-5948-4df1-9670-2f9177cf2fe4';
  const speakerId = 'aa60f5d2-5948-4df1-9670-2f9177cf2fe4';
  const speakerUserId = 'bb60f5d2-5948-4df1-9670-2f9177cf2fe4';

  const speakerRows = [{ id: speakerId, user_id: speakerUserId, name: 'Jane Speaker' }];
  const attendee = { id: attendeeId, email: 'attendee@example.com', name: 'Ana', username: null, ticketType: 'vip' };

  const fromByTable = new Map<string, ReturnType<typeof makeChain>>();

  beforeEach(() => {
    jest.resetModules();
    mockAuthorizeEventAdmin.mockReset();
    mockListEventAttendees.mockReset();
    mockRpc.mockReset();
    mockFrom.mockReset();
    mockGetUserById.mockReset();
    mockRateLimitOk.mockReturnValue(true);
    mockSendMeetingNotificationEmail.mockClear();

    fromByTable.clear();
    fromByTable.set('bsl_speakers', makeChain({ data: speakerRows, error: null }));
    fromByTable.set('admin_matchmaking_runs', makeChain({ data: null, error: null }));
    mockFrom.mockImplementation((table: string) => fromByTable.get(table) || makeChain());

    mockAuthorizeEventAdmin.mockResolvedValue({
      userId: actorId,
      supabase: {
        rpc: (...args: unknown[]) => mockRpc(...args),
        from: (...args: unknown[]) => mockFrom(...args),
        auth: { admin: { getUserById: (...args: unknown[]) => mockGetUserById(...args) } },
      },
    });
    mockListEventAttendees.mockResolvedValue([attendee]);
  });

  const post = async (body: Record<string, unknown>) => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/matchmaking+api');
    return POST(new Request('https://api.hashpass.tech/api/admin/matchmaking', {
      method: 'POST',
      body: JSON.stringify(body),
    }));
  };

  const get = async (eventId: string) => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/admin/matchmaking+api');
    return GET(new Request(`https://api.hashpass.tech/api/admin/matchmaking?eventId=${eventId}`));
  };

  it('GET resolves candidates through the event-scoped attendee list, not a platform-wide user search', async () => {
    const response = await get('chile2026');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.users).toEqual([attendee]);
    expect(mockListEventAttendees).toHaveBeenCalledWith(expect.anything(), actorId, 'chile2026');
    expect(mockRpc).not.toHaveBeenCalledWith('admin_search_active_users', expect.anything());
  });

  it('rejects a manual pair whose user is not registered for the event', async () => {
    const response = await post({
      eventId: 'chile2026',
      mode: 'manual',
      pairs: [{ userId: outsiderId, speakerId }],
    });
    const body = await response.json();
    expect(body.data.created).toEqual([]);
    expect(body.data.failures).toEqual([
      { pair: { userId: outsiderId, speakerId }, error: 'User is not registered for this event' },
    ]);
    expect(mockRpc).not.toHaveBeenCalledWith('insert_meeting_request', expect.anything());
  });

  it('creates a match for a real attendee through the canonical insert_meeting_request RPC, using a valid pending status', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ id: 'req-1', requester_id: attendeeId, speaker_id: speakerUserId, status: 'pending', created_at: '2026-08-03T00:00:00Z' }],
      error: null,
    });

    const response = await post({
      eventId: 'chile2026',
      mode: 'manual',
      pairs: [{ userId: attendeeId, speakerId }],
      message: 'Come say hi',
    });
    const body = await response.json();

    expect(mockRpc).toHaveBeenCalledWith('insert_meeting_request', expect.objectContaining({
      p_requester_id: attendeeId,
      p_speaker_id: speakerId,
      p_requester_ticket_type: 'vip',
      p_meeting_type: 'networking',
      p_message: 'Come say hi',
      p_event_id: 'chile2026',
    }));
    // The old code inserted status: 'requested' directly, which is not a
    // member of the meeting_request_status enum (pending/accepted/declined/
    // expired/cancelled/completed) — the RPC itself now owns writing 'pending'.
    const insertCall = mockRpc.mock.calls.find(([name]) => name === 'insert_meeting_request');
    expect(insertCall?.[1]).not.toHaveProperty('status');

    expect(body.data.created).toEqual([{ id: 'req-1', requester_id: attendeeId, speaker_id: speakerUserId, status: 'pending', created_at: '2026-08-03T00:00:00Z' }]);
    expect(body.data.failures).toEqual([]);
    expect(mockSendMeetingNotificationEmail).toHaveBeenCalledTimes(2);
  });

  it('records an RPC-reported failure (e.g. exhausted pass entitlement) instead of reporting a false success', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Meeting request entitlement is no longer available' } });

    const response = await post({
      eventId: 'chile2026',
      mode: 'manual',
      pairs: [{ userId: attendeeId, speakerId }],
    });
    const body = await response.json();
    expect(body.data.created).toEqual([]);
    expect(body.data.failures).toEqual([
      { pair: { userId: attendeeId, speakerId }, error: 'Meeting request entitlement is no longer available' },
    ]);
    expect(mockSendMeetingNotificationEmail).not.toHaveBeenCalled();
  });
});
