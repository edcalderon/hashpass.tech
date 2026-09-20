/// <reference types="jest" />

const mockRpc = jest.fn();
const mockResolveSupportSession = jest.fn();
const mockSendCriticalNotificationEmail = jest.fn();

const mockIdempotencyStore = new Map<string, { response_status: number; response_body: unknown }>();

jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (table: string) => {
      if (table !== 'support_idempotency_keys') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: (_col: string, key: string) => ({
                maybeSingle: async () => ({ data: mockIdempotencyStore.get(key) ?? null, error: null }),
              }),
            }),
          }),
        }),
        insert: async (row: { key: string; response_status: number; response_body: unknown }) => {
          mockIdempotencyStore.set(row.key, { response_status: row.response_status, response_body: row.response_body });
          return { error: null };
        },
      };
    },
  }),
}));

jest.mock('@/lib/server/support-session', () => {
  const actual = jest.requireActual('@/lib/server/support-session');
  return {
    ...actual,
    resolveSupportSession: (...args: unknown[]) => mockResolveSupportSession(...args),
  };
});

jest.mock('@/lib/email', () => ({
  sendCriticalNotificationEmail: (...args: unknown[]) => mockSendCriticalNotificationEmail(...args),
}));

const SESSION = { sessionId: 's1', visitorId: 'visitor-1', appId: 'core' };

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://api.hashpass.tech/api/v1/support/tickets', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hashpass-app-id': 'core', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/support/tickets', () => {
  beforeEach(() => {
    jest.resetModules();
    mockRpc.mockReset();
    mockResolveSupportSession.mockReset();
    mockSendCriticalNotificationEmail.mockReset();
    mockIdempotencyStore.clear();
    delete process.env.SUPPORT_ADMIN_NOTIFICATION_EMAIL;
  });

  it('rejects a request with no valid support session', async () => {
    mockResolveSupportSession.mockResolvedValue(null);
    const { POST } = require('../../../../app/api/v1/support/tickets+api');

    const response = await POST(makeRequest({ subject: 'Help', message: 'I need help' }));

    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('creates a ticket for a valid session and notifies the support team', async () => {
    mockResolveSupportSession.mockResolvedValue(SESSION);
    mockRpc.mockResolvedValue({
      data: [{ id: 'ticket-1', subject: 'Help', status: 'open', priority: 'normal', created_at: 't1', updated_at: 't1' }],
      error: null,
    });
    mockSendCriticalNotificationEmail.mockResolvedValue({ success: true });
    process.env.SUPPORT_ADMIN_NOTIFICATION_EMAIL = 'support@hashpass.tech';

    const { POST } = require('../../../../app/api/v1/support/tickets+api');
    const response = await POST(makeRequest({ subject: 'Help', message: 'I need help' }, { 'idempotency-key': 'key-1' }));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ id: 'ticket-1', subject: 'Help', status: 'open' }));
    expect(mockRpc).toHaveBeenCalledWith(
      'create_support_ticket',
      expect.objectContaining({ p_visitor_id: 'visitor-1', p_subject: 'Help', p_message: 'I need help' }),
    );
    expect(mockSendCriticalNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: 'support@hashpass.tech' }),
    );
  });

  it('rejects an empty subject/message before calling the database', async () => {
    mockResolveSupportSession.mockResolvedValue(SESSION);
    const { POST } = require('../../../../app/api/v1/support/tickets+api');

    const response = await POST(makeRequest({ subject: '  ', message: '' }));

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('replays the stored response for a repeated Idempotency-Key instead of creating a second ticket', async () => {
    mockResolveSupportSession.mockResolvedValue(SESSION);
    mockRpc.mockResolvedValue({
      data: [{ id: 'ticket-1', subject: 'Help', status: 'open', priority: 'normal', created_at: 't1', updated_at: 't1' }],
      error: null,
    });

    const { POST } = require('../../../../app/api/v1/support/tickets+api');
    const first = await POST(makeRequest({ subject: 'Help', message: 'I need help' }, { 'idempotency-key': 'dupe-key' }));
    const second = await POST(makeRequest({ subject: 'Help', message: 'I need help' }, { 'idempotency-key': 'dupe-key' }));

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await first.json()).toEqual(await second.json());
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/v1/support/tickets', () => {
  beforeEach(() => {
    jest.resetModules();
    mockRpc.mockReset();
    mockResolveSupportSession.mockReset();
  });

  function listRequest(query = '') {
    return new Request(`https://api.hashpass.tech/api/v1/support/tickets${query}`, {
      headers: { 'x-hashpass-app-id': 'core' },
    });
  }

  it('returns 401 with no session', async () => {
    mockResolveSupportSession.mockResolvedValue(null);
    const { GET } = require('../../../../app/api/v1/support/tickets+api');
    const response = await GET(listRequest());
    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('lists the caller’s tickets with keyset pagination, trimming the lookahead row', async () => {
    mockResolveSupportSession.mockResolvedValue(SESSION);
    mockRpc.mockResolvedValue({
      data: [
        { id: 't1', subject: 'A', status: 'open', priority: 'normal', created_at: 't1', updated_at: 't3' },
        { id: 't2', subject: 'B', status: 'open', priority: 'normal', created_at: 't1', updated_at: 't2' },
      ],
      error: null,
    });

    const { GET } = require('../../../../app/api/v1/support/tickets+api');
    const response = await GET(listRequest('?status=open&limit=1'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.nextCursor).toBe('t1');
    expect(mockRpc).toHaveBeenCalledWith(
      'list_support_tickets_for_visitor',
      expect.objectContaining({ p_visitor_id: 'visitor-1', p_status: 'open', p_limit: 2 }),
    );
  });

  it('returns 500 when the database call fails', async () => {
    mockResolveSupportSession.mockResolvedValue(SESSION);
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const { GET } = require('../../../../app/api/v1/support/tickets+api');
    const response = await GET(listRequest());

    expect(response.status).toBe(500);
  });
});
