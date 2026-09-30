/// <reference types="jest" />

const mockGetHelpdeskTicket = jest.fn();
const mockListHelpdeskTicketComments = jest.fn();
const mockAddHelpdeskTicketComment = jest.fn();
const mockCloseHelpdeskTicket = jest.fn();
const mockUploadHelpdeskAttachment = jest.fn();

jest.mock('@/lib/server/frappe-helpdesk', () => {
  const actual = jest.requireActual('@/lib/server/frappe-helpdesk');
  return {
    ...actual,
    getHelpdeskTicket: (...args: unknown[]) => mockGetHelpdeskTicket(...args),
    listHelpdeskTicketComments: (...args: unknown[]) => mockListHelpdeskTicketComments(...args),
    addHelpdeskTicketComment: (...args: unknown[]) => mockAddHelpdeskTicketComment(...args),
    closeHelpdeskTicket: (...args: unknown[]) => mockCloseHelpdeskTicket(...args),
    uploadHelpdeskAttachment: (...args: unknown[]) => mockUploadHelpdeskAttachment(...args),
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

function multipartRequest(ticketId: string, fields: Record<string, unknown>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value instanceof Blob) form.append(key, value, (value as File).name);
    else form.append(key, String(value));
  }
  return new Request(`https://api.hashpass.tech/api/v1/support/frappe/tickets/${ticketId}`, {
    method: 'POST',
    body: form,
  });
}

function patchRequest(ticketId: string, body: unknown) {
  return new Request(`https://api.hashpass.tech/api/v1/support/frappe/tickets/${ticketId}`, {
    method: 'PATCH',
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

  it('rejects an invalid ticket id', async () => {
    const { GET } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');
    const response = await GET(getRequest('not valid!', 'a@example.com'));
    expect(response.status).toBe(400);
  });

  it('maps a config error to a 500 without leaking details', async () => {
    const { FrappeHelpdeskConfigError } = jest.requireActual('../../../../../lib/server/frappe-helpdesk');
    mockGetHelpdeskTicket.mockRejectedValue(new FrappeHelpdeskConfigError('FRAPPE_BASE_URL is not configured'));
    const { GET } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');

    const response = await GET(getRequest('HD-0001', 'a@example.com'));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.message).not.toMatch(/FRAPPE_BASE_URL/);
  });

  it('maps a Frappe request error to a 502', async () => {
    const { FrappeHelpdeskRequestError } = jest.requireActual('../../../../../lib/server/frappe-helpdesk');
    mockGetHelpdeskTicket.mockRejectedValue(new FrappeHelpdeskRequestError('boom', 500));
    const { GET } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');

    const response = await GET(getRequest('HD-0001', 'a@example.com'));

    expect(response.status).toBe(502);
  });

  it('rate limits repeated reads from the same IP', async () => {
    mockGetHelpdeskTicket.mockResolvedValue(TICKET);
    mockListHelpdeskTicketComments.mockResolvedValue([]);
    const { GET } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');

    let lastResponse;
    for (let i = 0; i < 6; i += 1) {
      lastResponse = await GET(getRequest('HD-0001', 'a@example.com'));
    }

    expect(lastResponse!.status).toBe(429);
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

  describe('multipart attachment upload branch', () => {
    it('rejects an invalid multipart body', async () => {
      const { POST } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');
      const badRequest = new Request('https://api.hashpass.tech/api/v1/support/frappe/tickets/HD-0001', {
        method: 'POST',
        headers: { 'content-type': 'multipart/form-data; boundary=x' },
        body: 'not actually multipart',
      });

      const response = await POST(badRequest);
      expect(response.status).toBe(400);
    });

    it('requires email and a non-empty file', async () => {
      const { POST } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');

      const noEmail = await POST(multipartRequest('HD-0001', { file: new Blob(['x'], { type: 'image/png' }) }));
      expect(noEmail.status).toBe(400);

      const noFile = await POST(multipartRequest('HD-0001', { email: 'a@example.com' }));
      expect(noFile.status).toBe(400);

      const emptyFile = await POST(
        multipartRequest('HD-0001', { email: 'a@example.com', file: new Blob([], { type: 'image/png' }) }),
      );
      expect(emptyFile.status).toBe(400);
    });

    it('rejects a file over the size limit', async () => {
      const { MAX_ATTACHMENT_BYTES } = jest.requireActual('../../../../../lib/server/frappe-helpdesk');
      const { POST } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');
      const oversized = new Blob([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], { type: 'image/png' });

      const response = await POST(multipartRequest('HD-0001', { email: 'a@example.com', file: oversized }));

      expect(response.status).toBe(413);
      expect(mockGetHelpdeskTicket).not.toHaveBeenCalled();
    });

    it('rejects a disallowed content type', async () => {
      const { POST } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');
      const file = new Blob(['x'], { type: 'application/zip' });

      const response = await POST(multipartRequest('HD-0001', { email: 'a@example.com', file }));

      expect(response.status).toBe(415);
      expect(mockGetHelpdeskTicket).not.toHaveBeenCalled();
    });

    it('returns 404 when the email does not match raised_by, without uploading', async () => {
      mockGetHelpdeskTicket.mockResolvedValue(TICKET);
      const { POST } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');
      const file = new Blob(['x'], { type: 'image/png' });

      const response = await POST(multipartRequest('HD-0001', { email: 'wrong@example.com', file }));

      expect(response.status).toBe(404);
      expect(mockUploadHelpdeskAttachment).not.toHaveBeenCalled();
    });

    it('uploads the attachment, strips a path from the reported file name, and posts an escaped attachment-link comment', async () => {
      mockGetHelpdeskTicket.mockResolvedValue(TICKET);
      mockUploadHelpdeskAttachment.mockResolvedValue({ fileId: 'file-1', fileName: '<evil>.png' });
      mockAddHelpdeskTicketComment.mockResolvedValue({
        id: 'c3',
        content: '<p>📎 <a href="hashpass-attachment://file-1">&lt;evil&gt;.png</a></p>',
        commentedBy: null,
        createdAt: 't3',
        isVisitorReply: true,
      });
      const { POST } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');
      const file = new File(['x'], 'C:\\fakepath\\photo.png', { type: 'image/png' });

      const response = await POST(multipartRequest('HD-0001', { email: 'a@example.com', file }));

      expect(response.status).toBe(201);
      expect(mockUploadHelpdeskAttachment).toHaveBeenCalledWith('HD-0001', {
        data: expect.anything(),
        fileName: 'photo.png',
      });
      const [, content] = mockAddHelpdeskTicketComment.mock.calls[0];
      expect(content).toContain('hashpass-attachment://file-1');
      expect(content).not.toContain('<evil>');
      expect(content).toContain('&lt;evil&gt;');
    });

    it('maps an upload failure through the same Frappe error mapping', async () => {
      const { FrappeHelpdeskRequestError } = jest.requireActual('../../../../../lib/server/frappe-helpdesk');
      mockGetHelpdeskTicket.mockResolvedValue(TICKET);
      mockUploadHelpdeskAttachment.mockRejectedValue(new FrappeHelpdeskRequestError('boom', 500));
      const { POST } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');
      const file = new Blob(['x'], { type: 'image/png' });

      const response = await POST(multipartRequest('HD-0001', { email: 'a@example.com', file }));

      expect(response.status).toBe(502);
    });
  });
});

describe('PATCH /api/v1/support/frappe/tickets/:ticketId (cancel ticket)', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetHelpdeskTicket.mockReset();
    mockCloseHelpdeskTicket.mockReset();
  });

  it('requires an email', async () => {
    const { PATCH } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');
    const response = await PATCH(patchRequest('HD-0001', {}));
    expect(response.status).toBe(400);
    expect(mockGetHelpdeskTicket).not.toHaveBeenCalled();
  });

  it('returns 404 when the email does not match raised_by, without closing the ticket', async () => {
    mockGetHelpdeskTicket.mockResolvedValue(TICKET);
    const { PATCH } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');

    const response = await PATCH(patchRequest('HD-0001', { email: 'wrong@example.com' }));

    expect(response.status).toBe(404);
    expect(mockCloseHelpdeskTicket).not.toHaveBeenCalled();
  });

  it('closes the ticket for the authorized owner', async () => {
    mockGetHelpdeskTicket.mockResolvedValue(TICKET);
    mockCloseHelpdeskTicket.mockResolvedValue({ ...TICKET, status: 'Closed' });
    const { PATCH } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');

    const response = await PATCH(patchRequest('HD-0001', { email: 'a@example.com' }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ticket).toEqual(expect.objectContaining({ status: 'Closed' }));
    expect(mockCloseHelpdeskTicket).toHaveBeenCalledWith('HD-0001');
  });

  it('maps an unexpected error to a 500', async () => {
    mockGetHelpdeskTicket.mockRejectedValue(new Error('unexpected'));
    const { PATCH } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');

    const response = await PATCH(patchRequest('HD-0001', { email: 'a@example.com' }));

    expect(response.status).toBe(500);
  });

  it('rate limits repeated cancel attempts from the same IP', async () => {
    mockGetHelpdeskTicket.mockResolvedValue(TICKET);
    mockCloseHelpdeskTicket.mockResolvedValue({ ...TICKET, status: 'Closed' });
    const { PATCH } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]+api');

    let lastResponse;
    for (let i = 0; i < 6; i += 1) {
      lastResponse = await PATCH(patchRequest('HD-0001', { email: 'a@example.com' }));
    }

    expect(lastResponse!.status).toBe(429);
  });
});
