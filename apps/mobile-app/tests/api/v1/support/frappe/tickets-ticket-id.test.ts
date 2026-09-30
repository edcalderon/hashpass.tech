/// <reference types="jest" />

const mockGetHelpdeskTicket = jest.fn();
const mockListHelpdeskTicketComments = jest.fn();
const mockAddHelpdeskTicketComment = jest.fn();
const mockUploadHelpdeskAttachment = jest.fn();
const mockCloseHelpdeskTicket = jest.fn();

jest.mock('@/lib/server/frappe-helpdesk', () => {
  const actual = jest.requireActual('@/lib/server/frappe-helpdesk');
  return {
    ...actual,
    getHelpdeskTicket: (...args: unknown[]) => mockGetHelpdeskTicket(...args),
    listHelpdeskTicketComments: (...args: unknown[]) => mockListHelpdeskTicketComments(...args),
    addHelpdeskTicketComment: (...args: unknown[]) => mockAddHelpdeskTicketComment(...args),
    uploadHelpdeskAttachment: (...args: unknown[]) => mockUploadHelpdeskAttachment(...args),
    closeHelpdeskTicket: (...args: unknown[]) => mockCloseHelpdeskTicket(...args),
  };
});

const TICKET = {
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

function attachmentRequest(ticketId: string, email: string, file: File | Blob, ip: string) {
  const form = new FormData();
  form.append('email', email);
  form.append('file', file, 'untrusted<name>.png');
  return new Request(`https://api.hashpass.tech/api/v1/support/frappe/tickets/${ticketId}`, {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
    body: form,
  });
}

function patchRequest(ticketId: string, body: unknown, ip: string) {
  return new Request(`https://api.hashpass.tech/api/v1/support/frappe/tickets/${ticketId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
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
    mockUploadHelpdeskAttachment.mockReset();
    mockCloseHelpdeskTicket.mockReset();
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

  it('uploads an authorized attachment and escapes its untrusted display name in the comment', async () => {
    mockGetHelpdeskTicket.mockResolvedValue(TICKET);
    mockUploadHelpdeskAttachment.mockResolvedValue({ fileId: 'FILE-0001', fileName: 'untrusted<name>.png' });
    mockAddHelpdeskTicketComment.mockResolvedValue({ id: 'c3', content: 'attachment', commentedBy: null, createdAt: 't3' });
    const { POST } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');
    const response = await POST(attachmentRequest('HD-0001', 'a@example.com', new Blob(['png'], { type: 'image/png' }), 'attachment-success'));

    expect(response.status).toBe(201);
    expect(mockUploadHelpdeskAttachment).toHaveBeenCalledWith('HD-0001', expect.objectContaining({ fileName: 'untrusted<name>.png' }));
    expect(mockAddHelpdeskTicketComment).toHaveBeenCalledWith('HD-0001', expect.stringContaining('untrusted&lt;name&gt;.png'));
    await expect(response.json()).resolves.toEqual({ message: expect.objectContaining({ id: 'c3' }) });
  });

  it.each([
    ['no uploaded file', new FormData(), 400],
    ['unsupported MIME type', (() => { const form = new FormData(); form.append('email', 'a@example.com'); form.append('file', new Blob(['html'], { type: 'text/html' }), 'bad.html'); return form; })(), 415],
  ])('rejects a multipart request with %s', async (_name, form, expectedStatus) => {
    const { POST } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/v1/support/frappe/tickets/HD-0001', {
      method: 'POST', headers: { 'x-forwarded-for': `multipart-${_name}` }, body: form,
    }));
    expect(response.status).toBe(expectedStatus);
    expect(mockUploadHelpdeskAttachment).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/support/frappe/tickets/:ticketId', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetHelpdeskTicket.mockReset();
    mockCloseHelpdeskTicket.mockReset();
  });

  it('requires an email before attempting to close a ticket', async () => {
    const { PATCH } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');
    const response = await PATCH(patchRequest('HD-0001', {}, 'close-no-email'));
    expect(response.status).toBe(400);
    expect(mockGetHelpdeskTicket).not.toHaveBeenCalled();
  });

  it('closes only the ticket owned by the requesting email', async () => {
    mockGetHelpdeskTicket.mockResolvedValue(TICKET);
    mockCloseHelpdeskTicket.mockResolvedValue({ ...TICKET, status: 'Closed' });
    const { PATCH } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');
    const response = await PATCH(patchRequest('HD-0001', { email: 'A@EXAMPLE.COM' }, 'close-success'));
    expect(response.status).toBe(200);
    expect(mockCloseHelpdeskTicket).toHaveBeenCalledWith('HD-0001');
    await expect(response.json()).resolves.toEqual({ ticket: expect.objectContaining({ status: 'Closed' }) });
  });

  it('does not close a ticket when ownership is not proven', async () => {
    mockGetHelpdeskTicket.mockResolvedValue(TICKET);
    const { PATCH } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');
    const response = await PATCH(patchRequest('HD-0001', { email: 'other@example.com' }, 'close-denied'));
    expect(response.status).toBe(404);
    expect(mockCloseHelpdeskTicket).not.toHaveBeenCalled();
  });
});
