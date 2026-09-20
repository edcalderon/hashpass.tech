/// <reference types="jest" />

const mockRpc = jest.fn();
const mockResolveSupportSession = jest.fn();
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

const SESSION = { sessionId: 's1', visitorId: 'visitor-1', appId: 'core' };
const TICKET_ID = '11111111-1111-1111-1111-111111111111';

function getRequest(query = '') {
  return new Request(`https://api.hashpass.tech/api/v1/support/tickets/${TICKET_ID}/messages${query}`, {
    headers: { 'x-hashpass-app-id': 'core' },
  });
}

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://api.hashpass.tech/api/v1/support/tickets/${TICKET_ID}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hashpass-app-id': 'core', ...headers },
    body: JSON.stringify(body),
  });
}

describe('GET/POST /api/v1/support/tickets/:ticketId/messages', () => {
  beforeEach(() => {
    jest.resetModules();
    mockRpc.mockReset();
    mockResolveSupportSession.mockReset();
    mockIdempotencyStore.clear();
  });

  it('returns 401 with no session', async () => {
    mockResolveSupportSession.mockResolvedValue(null);
    const { GET } = require('../../../../app/api/v1/support/tickets/[ticketId]/messages+api');
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('lists messages with keyset pagination, trimming the lookahead row', async () => {
    mockResolveSupportSession.mockResolvedValue(SESSION);
    mockRpc.mockResolvedValue({
      data: [
        { id: 'm1', ticket_id: TICKET_ID, author: 'customer', body: 'hi', delivery_status: 'sent', created_at: 't1' },
        { id: 'm2', ticket_id: TICKET_ID, author: 'agent', body: 'hello', delivery_status: 'sent', created_at: 't2' },
      ],
      error: null,
    });

    const { GET } = require('../../../../app/api/v1/support/tickets/[ticketId]/messages+api');
    const response = await GET(getRequest('?limit=1'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.nextCursor).toBe('m1');
    expect(mockRpc).toHaveBeenCalledWith('list_support_messages', expect.objectContaining({ p_limit: 2 }));
  });

  it('returns 404 when the ticket is not owned by the caller', async () => {
    mockResolveSupportSession.mockResolvedValue(SESSION);
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Ticket not found' } });

    const { GET } = require('../../../../app/api/v1/support/tickets/[ticketId]/messages+api');
    const response = await GET(getRequest());

    expect(response.status).toBe(404);
  });

  it('sends a message and replays an identical response for a repeated Idempotency-Key', async () => {
    mockResolveSupportSession.mockResolvedValue(SESSION);
    mockRpc.mockResolvedValue({
      data: [{ id: 'm3', ticket_id: TICKET_ID, author: 'customer', body: 'reply', delivery_status: 'sent', created_at: 't3' }],
      error: null,
    });

    const { POST } = require('../../../../app/api/v1/support/tickets/[ticketId]/messages+api');
    const first = await POST(postRequest({ body: 'reply' }, { 'idempotency-key': 'k1' }));
    const second = await POST(postRequest({ body: 'reply' }, { 'idempotency-key': 'k1' }));

    expect(first.status).toBe(201);
    expect(await first.json()).toEqual(await second.json());
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty message body before calling the database', async () => {
    mockResolveSupportSession.mockResolvedValue(SESSION);
    const { POST } = require('../../../../app/api/v1/support/tickets/[ticketId]/messages+api');
    const response = await POST(postRequest({ body: '   ' }));
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
