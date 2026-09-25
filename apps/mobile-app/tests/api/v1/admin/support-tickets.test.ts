/// <reference types="jest" />

const mockAuthorizeGlobalAdmin = jest.fn();
const mockRpc = jest.fn();

jest.mock('@/lib/server/global-admin', () => ({
  authorizeGlobalAdmin: (...args: unknown[]) => mockAuthorizeGlobalAdmin(...args),
}));

const TICKET_ID = '11111111-1111-1111-1111-111111111111';

describe('GET /api/v1/admin/support/tickets', () => {
  beforeEach(() => {
    jest.resetModules();
    mockAuthorizeGlobalAdmin.mockReset();
    mockRpc.mockReset();
  });

  it('rejects a non-admin caller without querying the database', async () => {
    mockAuthorizeGlobalAdmin.mockResolvedValue({ response: Response.json({ error: 'Forbidden' }, { status: 403 }) });
    const { GET } = require('../../../../app/api/v1/admin/support/tickets+api');

    const response = await GET(new Request('https://api.hashpass.tech/api/v1/admin/support/tickets'));

    expect(response.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects an invalid status filter before calling the database', async () => {
    mockAuthorizeGlobalAdmin.mockResolvedValue({ userId: 'admin-1', supabase: { rpc: mockRpc } });
    const { GET } = require('../../../../app/api/v1/admin/support/tickets+api');

    const response = await GET(new Request('https://api.hashpass.tech/api/v1/admin/support/tickets?status=bogus'));

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('lists tickets with keyset pagination and appId/status passthrough', async () => {
    mockAuthorizeGlobalAdmin.mockResolvedValue({ userId: 'admin-1', supabase: { rpc: mockRpc } });
    mockRpc.mockResolvedValue({
      data: [
        { id: TICKET_ID, app_id: 'core', subject: 'Help', status: 'open', priority: 'high', needs_human: true, created_at: 't1', updated_at: 't2' },
      ],
      error: null,
    });

    const { GET } = require('../../../../app/api/v1/admin/support/tickets+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/v1/admin/support/tickets?status=open&appId=core'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items[0]).toEqual(expect.objectContaining({ id: TICKET_ID, appId: 'core', needsHuman: true }));
    expect(mockRpc).toHaveBeenCalledWith(
      'list_support_tickets_admin',
      expect.objectContaining({ p_app_id: 'core', p_status: 'open' }),
    );
  });
});

describe('GET /api/v1/admin/support/tickets/:ticketId', () => {
  beforeEach(() => {
    jest.resetModules();
    mockAuthorizeGlobalAdmin.mockReset();
  });

  it('rejects a non-admin caller', async () => {
    mockAuthorizeGlobalAdmin.mockResolvedValue({ response: Response.json({ error: 'Forbidden' }, { status: 403 }) });
    const { GET } = require('../../../../app/api/v1/admin/support/tickets/[ticketId]+api');

    const response = await GET(new Request(`https://api.hashpass.tech/api/v1/admin/support/tickets/${TICKET_ID}`));

    expect(response.status).toBe(403);
  });

  it('returns ticket detail with its message history and visitor', async () => {
    const ticketRow = {
      id: TICKET_ID,
      app_id: 'core',
      subject: 'Help',
      status: 'open',
      priority: 'high',
      needs_human: true,
      context: null,
      created_at: 't1',
      updated_at: 't2',
      support_visitors: { id: 'visitor-1', email: 'visitor@example.com', name: null, external_id: null },
    };
    const messageRows = [
      { id: 'm1', ticket_id: TICKET_ID, author: 'customer', body: 'hi', delivery_status: 'sent', created_at: 't1' },
    ];

    mockAuthorizeGlobalAdmin.mockResolvedValue({
      userId: 'admin-1',
      supabase: {
        from: (table: string) => {
          if (table === 'support_tickets') {
            return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ticketRow, error: null }) }) }) };
          }
          return { select: () => ({ eq: () => ({ order: async () => ({ data: messageRows, error: null }) }) }) };
        },
      },
    });

    const { GET } = require('../../../../app/api/v1/admin/support/tickets/[ticketId]+api');
    const response = await GET(new Request(`https://api.hashpass.tech/api/v1/admin/support/tickets/${TICKET_ID}`));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({
        id: TICKET_ID,
        visitor: expect.objectContaining({ email: 'visitor@example.com' }),
        messages: [expect.objectContaining({ id: 'm1', body: 'hi' })],
      }),
    );
  });

  it('returns 404 when the ticket does not exist', async () => {
    mockAuthorizeGlobalAdmin.mockResolvedValue({
      userId: 'admin-1',
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
              order: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      },
    });

    const { GET } = require('../../../../app/api/v1/admin/support/tickets/[ticketId]+api');
    const response = await GET(new Request(`https://api.hashpass.tech/api/v1/admin/support/tickets/${TICKET_ID}`));

    expect(response.status).toBe(404);
  });
});
