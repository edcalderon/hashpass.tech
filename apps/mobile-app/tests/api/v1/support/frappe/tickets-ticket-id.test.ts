/// <reference types="jest" />

const mockGetHelpdeskTicket = jest.fn();
const mockListHelpdeskTicketComments = jest.fn();
const mockAddHelpdeskTicketComment = jest.fn();

jest.mock('@/lib/server/frappe-helpdesk', () => {
  const actual = jest.requireActual('@/lib/server/frappe-helpdesk');
  return {
    ...actual,
    getHelpdeskTicket: (...args: unknown[]) => mockGetHelpdeskTicket(...args),
    listHelpdeskTicketComments: (...args: unknown[]) => mockListHelpdeskTicketComments(...args),
    addHelpdeskTicketComment: (...args: unknown[]) => mockAddHelpdeskTicketComment(...args),
  };
});

const TICKET: import('../../../../../lib/server/frappe-helpdesk').FrappeHelpdeskTicket = {
  id: 'HD-0001',
  subject: 'Help',
  status: 'Open',
  priority: 'Medium',
  raisedBy: 'a@example.com',
  createdAt: 't1',
  updatedAt: 't1',
};

function getRequest(ticketId: string, email?: string) {
  const url = new URL(`https://api.hashpass.tech/api/v1/support/frappe/tickets/${ticketId}`);
  if (email !== undefined) url.searchParams.set('email', email);
  return new Request(url);
}

function postRequest(ticketId: string, body: unknown) {
  return new Request(`https://api.hashpass.tech/api/v1/support/frappe/tickets/${ticketId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/v1/support/frappe/tickets/:ticketId', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetHelpdeskTicket.mockReset();
    mockListHelpdeskTicketComments.mockReset();
  });

  it('requires an email query param', async () => {
    const { GET } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');
    const response = await GET(getRequest('HD-0001'));
    expect(response.status).toBe(400);
    expect(mockGetHelpdeskTicket).not.toHaveBeenCalled();
  });

  it('returns 404 without leaking existence when the email does not match raised_by', async () => {
    mockGetHelpdeskTicket.mockResolvedValue(TICKET);
    const { GET } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');

    const response = await GET(getRequest('HD-0001', 'someone-else@example.com'));

    expect(response.status).toBe(404);
    expect(mockListHelpdeskTicketComments).not.toHaveBeenCalled();
  });

  it('returns 404 when the ticket does not exist', async () => {
    mockGetHelpdeskTicket.mockResolvedValue(null);
    const { GET } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');

    const response = await GET(getRequest('HD-0001', 'a@example.com'));

    expect(response.status).toBe(404);
  });

  it('matches raised_by case-insensitively and returns the ticket with its messages', async () => {
    mockGetHelpdeskTicket.mockResolvedValue(TICKET);
    mockListHelpdeskTicketComments.mockResolvedValue([
      { id: 'c1', content: 'hi', commentedBy: 'agent@hashpass.tech', createdAt: 't1' },
    ]);
    const { GET } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');

    const response = await GET(getRequest('HD-0001', 'A@EXAMPLE.COM'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ticket).toEqual(expect.objectContaining({ id: 'HD-0001' }));
    expect(body.messages).toEqual([expect.objectContaining({ id: 'c1' })]);
    expect(mockListHelpdeskTicketComments).toHaveBeenCalledWith('HD-0001');
  });
});

describe('POST /api/v1/support/frappe/tickets/:ticketId', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetHelpdeskTicket.mockReset();
    mockAddHelpdeskTicketComment.mockReset();
  });

  it('requires email and content', async () => {
    const { POST } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');

    const response = await POST(postRequest('HD-0001', { email: 'a@example.com', content: '' }));

    expect(response.status).toBe(400);
    expect(mockGetHelpdeskTicket).not.toHaveBeenCalled();
  });

  it('returns 404 when the email does not match raised_by, without posting a reply', async () => {
    mockGetHelpdeskTicket.mockResolvedValue(TICKET);
    const { POST } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');

    const response = await POST(postRequest('HD-0001', { email: 'wrong@example.com', content: 'hi' }));

    expect(response.status).toBe(404);
    expect(mockAddHelpdeskTicketComment).not.toHaveBeenCalled();
  });

  it('posts the reply as a new HD Ticket Comment for the authorized ticket', async () => {
    mockGetHelpdeskTicket.mockResolvedValue(TICKET);
    mockAddHelpdeskTicketComment.mockResolvedValue({
      id: 'c2',
      content: 'a reply',
      commentedBy: null,
      createdAt: 't2',
    });
    const { POST } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');

    const response = await POST(postRequest('HD-0001', { email: 'a@example.com', content: 'a reply' }));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.message).toEqual(expect.objectContaining({ id: 'c2', content: 'a reply' }));
    expect(mockAddHelpdeskTicketComment).toHaveBeenCalledWith('HD-0001', 'a reply');
  });

  it('maps an unexpected error to a 500 without leaking details', async () => {
    mockGetHelpdeskTicket.mockRejectedValue(new Error('unexpected'));
    const { POST } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');

    const response = await POST(postRequest('HD-0001', { email: 'a@example.com', content: 'hi' }));

    expect(response.status).toBe(500);
  });
});
