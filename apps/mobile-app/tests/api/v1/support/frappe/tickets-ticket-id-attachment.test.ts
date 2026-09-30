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

const TICKET = {
  id: 'HD-0001', subject: 'Help', status: 'Open', priority: 'Medium', raisedBy: 'a@example.com', createdAt: 't1', updatedAt: 't1',
};

function getRequest(ticketId: string, params: Record<string, string | undefined>) {
  const url = new URL(`https://api.hashpass.tech/api/v1/support/frappe/tickets/${ticketId}/attachment`);
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, value);
  return new Request(url);
}

describe('GET /api/v1/support/frappe/tickets/:ticketId/attachment', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetHelpdeskTicket.mockReset();
    mockFetchHelpdeskAttachment.mockReset();
  });

  it.each([
    ['not valid!', { email: 'a@example.com', file: 'file-1' }, 'invalid ticket id'],
    ['HD-0001', { file: 'file-1' }, 'missing email'],
    ['HD-0001', { email: 'a@example.com' }, 'missing file id'],
  ])('rejects %s requests with %s', async (ticketId, params, _reason) => {
    const { GET } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]/attachment+api');
    const response = await GET(getRequest(ticketId, params));
    expect(response.status).toBe(400);
    expect(mockGetHelpdeskTicket).not.toHaveBeenCalled();
  });

  it('does not disclose or download an attachment from a ticket owned by another email', async () => {
    mockGetHelpdeskTicket.mockResolvedValue(TICKET);
    const { GET } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]/attachment+api');
    const response = await GET(getRequest('HD-0001', { email: 'wrong@example.com', file: 'file-1' }));
    expect(response.status).toBe(404);
    expect(mockFetchHelpdeskAttachment).not.toHaveBeenCalled();
  });

  it('proxies authorized bytes with private cache controls and a quote-safe filename', async () => {
    mockGetHelpdeskTicket.mockResolvedValue(TICKET);
    mockFetchHelpdeskAttachment.mockResolvedValue({ body: new Uint8Array([1, 2, 3]).buffer, contentType: 'image/png', fileName: 'evil".png' });
    const { GET } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]/attachment+api');
    const response = await GET(getRequest('HD-0001', { email: 'A@EXAMPLE.COM', file: 'file-1' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-disposition')).toBe('inline; filename="evil.png"');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(mockFetchHelpdeskAttachment).toHaveBeenCalledWith('HD-0001', 'file-1');
  });

  it.each([
    ['config', () => { const { FrappeHelpdeskConfigError } = jest.requireActual('../../../../../lib/server/frappe-helpdesk'); return new FrappeHelpdeskConfigError('missing'); }, 500, 'Support is not configured'],
    ['missing attachment', () => { const { FrappeHelpdeskRequestError } = jest.requireActual('../../../../../lib/server/frappe-helpdesk'); return new FrappeHelpdeskRequestError('missing', 404); }, 404, 'Attachment not found'],
    ['upstream request', () => { const { FrappeHelpdeskRequestError } = jest.requireActual('../../../../../lib/server/frappe-helpdesk'); return new FrappeHelpdeskRequestError('upstream', 500); }, 502, 'Unable to reach support right now'],
    ['unexpected', () => new Error('unexpected'), 500, 'Unable to reach support right now'],
  ])('maps a %s failure without leaking private detail', async (_name, error, status, message) => {
    mockGetHelpdeskTicket.mockResolvedValue(TICKET);
    mockFetchHelpdeskAttachment.mockRejectedValue(error());
    const { GET } = require('../../../../../app/api/v1/support/frappe/tickets/[ticketId]/attachment+api');
    const response = await GET(getRequest('HD-0001', { email: 'a@example.com', file: 'file-1' }));
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ message });
  });
});
