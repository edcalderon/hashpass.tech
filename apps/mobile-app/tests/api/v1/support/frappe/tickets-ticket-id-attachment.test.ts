/// <reference types="jest" />

const mockGetHelpdeskTicket = jest.fn();
const mockFetchHelpdeskAttachment = jest.fn();

jest.mock('@/lib/server/frappe-helpdesk', () => {
  const actual = jest.requireActual('@/lib/server/frappe-helpdesk');
  return {
    ...actual,
    getHelpdeskTicket: (...args: unknown[]) => mockGetHelpdeskTicket(...args),
    fetchHelpdeskAttachment: (...args: unknown[]) => mockFetchHelpdeskAttachment(...args),
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

function getRequest(ticketId: string, params: Record<string, string | undefined>) {
  const url = new URL(`https://api.hashpass.tech/api/v1/support/frappe/tickets/${ticketId}/attachment`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return new Request(url);
}

describe('GET /api/v1/support/frappe/tickets/:ticketId/attachment', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetHelpdeskTicket.mockReset();
    mockFetchHelpdeskAttachment.mockReset();
  });

  it('rejects an invalid ticket id', async () => {
    const { GET } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]/attachment+api');
    const response = await GET(getRequest('not valid!', { email: 'a@example.com', file: 'file-1' }));
    expect(response.status).toBe(400);
  });

  it('requires an email', async () => {
    const { GET } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]/attachment+api');
    const response = await GET(getRequest('HD-0001', { file: 'file-1' }));
    expect(response.status).toBe(400);
    expect(mockGetHelpdeskTicket).not.toHaveBeenCalled();
  });

  it('requires a file id', async () => {
    const { GET } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]/attachment+api');
    const response = await GET(getRequest('HD-0001', { email: 'a@example.com' }));
    expect(response.status).toBe(400);
    expect(mockGetHelpdeskTicket).not.toHaveBeenCalled();
  });

  it('rate limits repeated downloads from the same IP', async () => {
    mockGetHelpdeskTicket.mockResolvedValue(TICKET);
    mockFetchHelpdeskAttachment.mockResolvedValue({
      body: new Uint8Array([1]).buffer,
      contentType: 'image/png',
      fileName: 'a.png',
    });
    const { GET } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]/attachment+api');

    let lastResponse;
    for (let i = 0; i < 6; i += 1) {
      lastResponse = await GET(getRequest('HD-0001', { email: 'a@example.com', file: 'file-1' }));
    }

    expect(lastResponse!.status).toBe(429);
  });

  it('returns 404 without leaking existence when the email does not match raised_by', async () => {
    mockGetHelpdeskTicket.mockResolvedValue(TICKET);
    const { GET } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]/attachment+api');

    const response = await GET(getRequest('HD-0001', { email: 'wrong@example.com', file: 'file-1' }));

    expect(response.status).toBe(404);
    expect(mockFetchHelpdeskAttachment).not.toHaveBeenCalled();
  });

  it('downloads the attachment with the right headers, stripping quotes from the file name', async () => {
    mockGetHelpdeskTicket.mockResolvedValue(TICKET);
    mockFetchHelpdeskAttachment.mockResolvedValue({
      body: new Uint8Array([1, 2, 3]).buffer,
      contentType: 'image/png',
      fileName: 'evil".png',
    });
    const { GET } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]/attachment+api');

    const response = await GET(getRequest('HD-0001', { email: 'A@EXAMPLE.COM', file: 'file-1' }));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-disposition')).toBe('inline; filename="evil.png"');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(mockFetchHelpdeskAttachment).toHaveBeenCalledWith('HD-0001', 'file-1');
  });

  it('maps a config error to a 500 without leaking details', async () => {
    const { FrappeHelpdeskConfigError } = jest.requireActual('../../../../../lib/server/frappe-helpdesk');
    mockGetHelpdeskTicket.mockResolvedValue(TICKET);
    mockFetchHelpdeskAttachment.mockRejectedValue(new FrappeHelpdeskConfigError('FRAPPE_BASE_URL is not configured'));
    const { GET } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]/attachment+api');

    const response = await GET(getRequest('HD-0001', { email: 'a@example.com', file: 'file-1' }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.message).not.toMatch(/FRAPPE_BASE_URL/);
  });

  it('maps a 404 Frappe request error to a 404 "Attachment not found"', async () => {
    const { FrappeHelpdeskRequestError } = jest.requireActual('../../../../../lib/server/frappe-helpdesk');
    mockGetHelpdeskTicket.mockResolvedValue(TICKET);
    mockFetchHelpdeskAttachment.mockRejectedValue(new FrappeHelpdeskRequestError('not attached', 404));
    const { GET } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]/attachment+api');

    const response = await GET(getRequest('HD-0001', { email: 'a@example.com', file: 'file-1' }));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.message).toBe('Attachment not found');
  });

  it('maps a non-404 Frappe request error to a 502', async () => {
    const { FrappeHelpdeskRequestError } = jest.requireActual('../../../../../lib/server/frappe-helpdesk');
    mockGetHelpdeskTicket.mockResolvedValue(TICKET);
    mockFetchHelpdeskAttachment.mockRejectedValue(new FrappeHelpdeskRequestError('boom', 500));
    const { GET } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]/attachment+api');

    const response = await GET(getRequest('HD-0001', { email: 'a@example.com', file: 'file-1' }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ message: 'Unable to reach support right now' });
  });

  it('maps an unexpected error to a 500', async () => {
    mockGetHelpdeskTicket.mockRejectedValue(new Error('unexpected'));
    const { GET } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]/attachment+api');

    const response = await GET(getRequest('HD-0001', { email: 'a@example.com', file: 'file-1' }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ message: 'Unable to reach support right now' });
  });
});
