/// <reference types="jest" />

const mockAuthorizeEventAdmin = jest.fn();
const mockListEventAttendees = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockGetUserById = jest.fn();
const mockRateLimitOk = jest.fn((_key: string) => true);
const mockSendAdminCampaignEmail = jest.fn().mockResolvedValue({ success: true, messageId: 'msg-1' });

jest.mock('@/lib/server/event-admin', () => ({
  authorizeEventAdmin: (...args: unknown[]) => mockAuthorizeEventAdmin(...args),
  listEventAttendees: (...args: unknown[]) => mockListEventAttendees(...args),
}));
jest.mock('@/lib/bsl/rateLimit', () => ({
  rateLimitOk: (key: string) => mockRateLimitOk(key),
}));
jest.mock('@/lib/email', () => {
  const actual = jest.requireActual('@/lib/email');
  return {
    ...actual,
    sendAdminCampaignEmail: (...args: unknown[]) => mockSendAdminCampaignEmail(...args),
  };
});

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

describe('/api/admin/communications', () => {
  const actorId = '7f60f5d2-5948-4df1-9670-2f9177cf2fe4';
  const attendeeId = '8f60f5d2-5948-4df1-9670-2f9177cf2fe4';
  const attendee = { id: attendeeId, email: 'attendee@example.com' };

  const fromByTable = new Map<string, ReturnType<typeof makeChain>>();

  beforeEach(() => {
    jest.resetModules();
    mockAuthorizeEventAdmin.mockReset();
    mockListEventAttendees.mockReset();
    mockRpc.mockReset();
    mockFrom.mockReset();
    mockGetUserById.mockReset();
    mockRateLimitOk.mockReturnValue(true);
    mockSendAdminCampaignEmail.mockClear();

    fromByTable.clear();
    fromByTable.set('bsl_speakers', makeChain({ data: [], error: null }));
    fromByTable.set('admin_email_deliveries', makeChain({ data: null, error: null }));
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
    const { POST } = require('../../app/api/admin/communications+api');
    return POST(new Request('https://api.hashpass.tech/api/admin/communications', {
      method: 'POST',
      body: JSON.stringify(body),
    }));
  };

  const draft = { eventId: 'chile2026', audience: 'attendees', subject: 'Hi', heading: 'Welcome', message: 'See you soon' };

  it('resolves the attendees audience through the event-scoped attendee list, not a platform-wide user search', async () => {
    const response = await post(draft);
    const body = await response.json();

    expect(mockListEventAttendees).toHaveBeenCalledWith(expect.anything(), actorId, 'chile2026');
    expect(mockRpc).not.toHaveBeenCalledWith('admin_search_active_users', expect.anything());
    expect(mockSendAdminCampaignEmail).toHaveBeenCalledWith(expect.objectContaining({ to: attendee.email }));
    expect(body.data).toEqual({ sent: 1, failed: 0, total: 1 });
  });

  it('surfaces an attendee-resolution failure instead of silently sending to nobody', async () => {
    mockListEventAttendees.mockRejectedValueOnce(new Error('Forbidden'));
    const response = await post(draft);
    expect(response.status).toBe(500);
    expect(mockSendAdminCampaignEmail).not.toHaveBeenCalled();
  });

  it('preview renders the actual template output for the selected event and template', async () => {
    const response = await post({ ...draft, template: 'raw', preview: true });
    const body = await response.json();
    expect(body.data.template).toBe('raw');
    expect(body.data.html).toContain('Welcome');
    expect(mockSendAdminCampaignEmail).not.toHaveBeenCalled();
  });
});
