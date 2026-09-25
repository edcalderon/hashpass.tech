/// <reference types="jest" />

const mockRpc = jest.fn();
const mockResolveSupportSession = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
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
  return new Request(`https://api.hashpass.tech/api/v1/support/tickets/${TICKET_ID}/events${query}`, {
    headers: { 'x-hashpass-app-id': 'core' },
  });
}

describe('GET /api/v1/support/tickets/:ticketId/events', () => {
  beforeEach(() => {
    jest.resetModules();
    mockRpc.mockReset();
    mockResolveSupportSession.mockReset();
  });

  it('returns 401 with no session', async () => {
    mockResolveSupportSession.mockResolvedValue(null);
    const { GET } = require('../../../../app/api/v1/support/tickets/[ticketId]/events+api');
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
  });

  it('nests message and ticket rows under the SupportEvent union shape, not flattened', async () => {
    mockResolveSupportSession.mockResolvedValue(SESSION);
    mockRpc.mockResolvedValue({
      data: [
        { cursor: 'c1', event_type: 'message.created', payload: { id: 'm1', body: 'hi' } },
        { cursor: 'c2', event_type: 'ticket.updated', payload: { id: TICKET_ID, status: 'resolved' } },
      ],
      error: null,
    });

    const { GET } = require('../../../../app/api/v1/support/tickets/[ticketId]/events+api');
    const response = await GET(getRequest('?cursor=c0'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items[0]).toEqual({ type: 'message.created', cursor: 'c1', message: { id: 'm1', body: 'hi' } });
    expect(body.items[1]).toEqual({ type: 'ticket.updated', cursor: 'c2', ticket: { id: TICKET_ID, status: 'resolved' } });
    expect(body.nextCursor).toBe('c2');
    expect(mockRpc).toHaveBeenCalledWith('list_support_events', expect.objectContaining({ p_cursor: 'c0' }));
  });

  it('returns 404 for a ticket the caller does not own', async () => {
    mockResolveSupportSession.mockResolvedValue(SESSION);
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Ticket not found' } });

    const { GET } = require('../../../../app/api/v1/support/tickets/[ticketId]/events+api');
    const response = await GET(getRequest());

    expect(response.status).toBe(404);
  });
});
