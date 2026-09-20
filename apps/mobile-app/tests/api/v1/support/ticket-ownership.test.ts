/// <reference types="jest" />

const mockRpc = jest.fn();
const mockMaybeSingle = jest.fn();
const mockResolveSupportSession = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: mockMaybeSingle }),
        }),
      }),
    }),
  }),
}));

jest.mock('@/lib/server/support-session', () => {
  const actual = jest.requireActual('@/lib/server/support-session');
  return {
    ...actual,
    resolveSupportSession: (...args: unknown[]) => mockResolveSupportSession(...args),
  };
});

const SESSION_A = { sessionId: 's1', visitorId: 'visitor-a', appId: 'core' };
const TICKET_ID = '11111111-1111-1111-1111-111111111111';

function getRequest() {
  return new Request(`https://api.hashpass.tech/api/v1/support/tickets/${TICKET_ID}`, {
    headers: { 'x-hashpass-app-id': 'core' },
  });
}

function patchRequest(status: string) {
  return new Request(`https://api.hashpass.tech/api/v1/support/tickets/${TICKET_ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-hashpass-app-id': 'core' },
    body: JSON.stringify({ status }),
  });
}

describe('GET/PATCH /api/v1/support/tickets/:ticketId ownership', () => {
  beforeEach(() => {
    jest.resetModules();
    mockRpc.mockReset();
    mockMaybeSingle.mockReset();
    mockResolveSupportSession.mockReset();
  });

  it('returns the ticket when it belongs to the caller’s visitor', async () => {
    mockResolveSupportSession.mockResolvedValue(SESSION_A);
    mockMaybeSingle.mockResolvedValue({
      data: { id: TICKET_ID, subject: 'Help', status: 'open', priority: 'normal', created_at: 't1', updated_at: 't1' },
      error: null,
    });

    const { GET } = require('../../../../app/api/v1/support/tickets/[ticketId]+api');
    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ id: TICKET_ID }));
  });

  it('returns 404 for a ticket owned by a different visitor (the .eq(visitor_id) filter finds nothing)', async () => {
    mockResolveSupportSession.mockResolvedValue(SESSION_A);
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const { GET } = require('../../../../app/api/v1/support/tickets/[ticketId]+api');
    const response = await GET(getRequest());

    expect(response.status).toBe(404);
  });

  it('returns 401 for GET with no session at all', async () => {
    mockResolveSupportSession.mockResolvedValue(null);
    const { GET } = require('../../../../app/api/v1/support/tickets/[ticketId]+api');
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it('rejects a PATCH with an unsupported status before calling the database', async () => {
    mockResolveSupportSession.mockResolvedValue(SESSION_A);
    const { PATCH } = require('../../../../app/api/v1/support/tickets/[ticketId]+api');
    const response = await PATCH(patchRequest('closed'));
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('surfaces a 404 when set_ticket_status cannot find an owned ticket', async () => {
    mockResolveSupportSession.mockResolvedValue(SESSION_A);
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Ticket not found' } });

    const { PATCH } = require('../../../../app/api/v1/support/tickets/[ticketId]+api');
    const response = await PATCH(patchRequest('resolved'));

    expect(response.status).toBe(404);
  });
});
