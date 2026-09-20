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
const TICKET_ID = '11111111-1111-1111-1111-111111111111';
const TICKET_ROW = {
  id: TICKET_ID,
  app_id: 'core',
  visitor_id: 'visitor-1',
  subject: 'Help',
  status: 'open',
  priority: 'high',
  needs_human: true,
  context: null,
  created_at: 't1',
  updated_at: 't2',
};

function readRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://api.hashpass.tech/api/v1/support/tickets/${TICKET_ID}/read`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hashpass-app-id': 'core', ...headers },
    body: JSON.stringify(body),
  });
}

function handoffRequest(headers: Record<string, string> = {}) {
  return new Request(`https://api.hashpass.tech/api/v1/support/tickets/${TICKET_ID}/handoff`, {
    method: 'POST',
    headers: { 'x-hashpass-app-id': 'core', ...headers },
  });
}

describe('POST /api/v1/support/tickets/:ticketId/read', () => {
  beforeEach(() => {
    jest.resetModules();
    mockRpc.mockReset();
    mockResolveSupportSession.mockReset();
    mockIdempotencyStore.clear();
  });

  it('returns 401 with no session', async () => {
    mockResolveSupportSession.mockResolvedValue(null);
    const { POST } = require('../../../../app/api/v1/support/tickets/[ticketId]/read+api');
    const response = await POST(readRequest({ cursor: 'x' }));
    expect(response.status).toBe(401);
  });

  it('marks the ticket read at the given cursor', async () => {
    mockResolveSupportSession.mockResolvedValue(SESSION);
    mockRpc.mockResolvedValue({ data: [TICKET_ROW], error: null });

    const { POST } = require('../../../../app/api/v1/support/tickets/[ticketId]/read+api');
    const response = await POST(readRequest({ cursor: 'cursor-1' }));

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('mark_ticket_read', expect.objectContaining({ p_cursor: 'cursor-1' }));
  });

  it('returns 404 for a ticket the caller does not own', async () => {
    mockResolveSupportSession.mockResolvedValue(SESSION);
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Ticket not found' } });

    const { POST } = require('../../../../app/api/v1/support/tickets/[ticketId]/read+api');
    const response = await POST(readRequest({}));

    expect(response.status).toBe(404);
  });
});

describe('POST /api/v1/support/tickets/:ticketId/handoff', () => {
  beforeEach(() => {
    jest.resetModules();
    mockRpc.mockReset();
    mockResolveSupportSession.mockReset();
    mockSendCriticalNotificationEmail.mockReset();
    mockIdempotencyStore.clear();
    delete process.env.SUPPORT_ADMIN_NOTIFICATION_EMAIL;
  });

  it('returns 401 with no session', async () => {
    mockResolveSupportSession.mockResolvedValue(null);
    const { POST } = require('../../../../app/api/v1/support/tickets/[ticketId]/handoff+api');
    const response = await POST(handoffRequest());
    expect(response.status).toBe(401);
  });

  it('requests handoff and notifies the support team when configured', async () => {
    mockResolveSupportSession.mockResolvedValue(SESSION);
    mockRpc.mockResolvedValue({ data: [TICKET_ROW], error: null });
    mockSendCriticalNotificationEmail.mockResolvedValue({ success: true });
    process.env.SUPPORT_ADMIN_NOTIFICATION_EMAIL = 'support@hashpass.tech';

    const { POST } = require('../../../../app/api/v1/support/tickets/[ticketId]/handoff+api');
    const response = await POST(handoffRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ id: TICKET_ID, status: 'open' }));
    expect(mockSendCriticalNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: 'support@hashpass.tech' }),
    );
  });

  it('skips the notification email entirely when no recipient is configured', async () => {
    mockResolveSupportSession.mockResolvedValue(SESSION);
    mockRpc.mockResolvedValue({ data: [TICKET_ROW], error: null });

    const { POST } = require('../../../../app/api/v1/support/tickets/[ticketId]/handoff+api');
    const response = await POST(handoffRequest());

    expect(response.status).toBe(200);
    expect(mockSendCriticalNotificationEmail).not.toHaveBeenCalled();
  });

  it('returns 404 when request_ticket_handoff cannot find an owned ticket', async () => {
    mockResolveSupportSession.mockResolvedValue(SESSION);
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Ticket not found' } });

    const { POST } = require('../../../../app/api/v1/support/tickets/[ticketId]/handoff+api');
    const response = await POST(handoffRequest());

    expect(response.status).toBe(404);
  });
});
