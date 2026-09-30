/// <reference types="jest" />

const ENV_KEYS = [
  'FRAPPE_BASE_URL',
  'FRAPPE_SUPPORT_READ_API_KEY',
  'FRAPPE_SUPPORT_READ_API_SECRET',
  'FRAPPE_SUPPORT_WRITE_API_KEY',
  'FRAPPE_SUPPORT_WRITE_API_SECRET',
  'FRAPPE_SUPPORT_TEAM',
] as const;

describe('lib/server/frappe-helpdesk', () => {
  const originalFetch = global.fetch;
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
    jest.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  function setConfigured() {
    process.env.FRAPPE_BASE_URL = 'https://helpdesk.example.com';
    process.env.FRAPPE_SUPPORT_READ_API_KEY = 'example-read-key';
    process.env.FRAPPE_SUPPORT_READ_API_SECRET = 'example-read-secret';
    process.env.FRAPPE_SUPPORT_WRITE_API_KEY = 'example-write-key';
    process.env.FRAPPE_SUPPORT_WRITE_API_SECRET = 'example-write-secret';
  }

  it('throws FrappeHelpdeskConfigError when FRAPPE_BASE_URL is missing', async () => {
    delete process.env.FRAPPE_BASE_URL;
    const { getHelpdeskTicket, FrappeHelpdeskConfigError } = require('../../../lib/server/frappe-helpdesk');

    await expect(getHelpdeskTicket('HD-0001')).rejects.toBeInstanceOf(FrappeHelpdeskConfigError);
  });

  it('throws FrappeHelpdeskConfigError when the write credentials are missing for a write call', async () => {
    process.env.FRAPPE_BASE_URL = 'https://helpdesk.example.com';
    process.env.FRAPPE_SUPPORT_READ_API_KEY = 'example-read-key';
    process.env.FRAPPE_SUPPORT_READ_API_SECRET = 'example-read-secret';
    delete process.env.FRAPPE_SUPPORT_WRITE_API_KEY;
    delete process.env.FRAPPE_SUPPORT_WRITE_API_SECRET;
    const { createHelpdeskTicket, FrappeHelpdeskConfigError } = require('../../../lib/server/frappe-helpdesk');

    await expect(
      createHelpdeskTicket({ subject: 'Help', raisedBy: 'a@example.com', description: 'x' }),
    ).rejects.toBeInstanceOf(FrappeHelpdeskConfigError);
  });

  it('creates a ticket with the configured team as agent_group, using the write token', async () => {
    setConfigured();
    process.env.FRAPPE_SUPPORT_TEAM = 'HASHPASS-QA';
    const fetchMock = jest.fn().mockResolvedValue(
      Response.json({
        data: {
          name: 'HD-0001',
          subject: 'Help',
          status: 'Open',
          priority: 'Medium',
          raised_by: 'a@example.com',
          creation: 't1',
          modified: 't1',
        },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { createHelpdeskTicket } = require('../../../lib/server/frappe-helpdesk');
    const ticket = await createHelpdeskTicket({
      subject: 'Help',
      raisedBy: 'a@example.com',
      description: 'I need help',
    });

    expect(ticket).toEqual(
      expect.objectContaining({ id: 'HD-0001', subject: 'Help', raisedBy: 'a@example.com' }),
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://helpdesk.example.com/api/resource/HD%20Ticket');
    expect(init.headers.Authorization).toBe('token example-write-key:example-write-secret');
    const body = JSON.parse(init.body);
    expect(body).toEqual(
      expect.objectContaining({
        subject: 'Help',
        raised_by: 'a@example.com',
        description: 'I need help',
        agent_group: 'HASHPASS-QA',
      }),
    );
  });

  it('returns null for a 404 ticket lookup instead of throwing', async () => {
    setConfigured();
    global.fetch = jest.fn().mockResolvedValue(
      Response.json({ message: 'not found' }, { status: 404 }),
    ) as unknown as typeof fetch;

    const { getHelpdeskTicket } = require('../../../lib/server/frappe-helpdesk');
    await expect(getHelpdeskTicket('HD-9999')).resolves.toBeNull();
  });

  it('re-throws a non-404 error from a ticket lookup as FrappeHelpdeskRequestError', async () => {
    setConfigured();
    global.fetch = jest.fn().mockResolvedValue(
      Response.json({ message: 'server exploded' }, { status: 500 }),
    ) as unknown as typeof fetch;

    const { getHelpdeskTicket, FrappeHelpdeskRequestError } = require('../../../lib/server/frappe-helpdesk');
    await expect(getHelpdeskTicket('HD-0001')).rejects.toBeInstanceOf(FrappeHelpdeskRequestError);
  });

  it('lists ticket comments filtered by reference_ticket, using the read token', async () => {
    setConfigured();
    const fetchMock = jest.fn().mockResolvedValue(
      Response.json({
        message: [
          { name: 'c1', content: 'hi', commented_by: 'agent@hashpass.tech', creation: 't1' },
        ],
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { listHelpdeskTicketComments } = require('../../../lib/server/frappe-helpdesk');
    const comments = await listHelpdeskTicketComments('HD-0001');

    expect(comments).toEqual([
      expect.objectContaining({ id: 'c1', content: 'hi', commentedBy: 'agent@hashpass.tech' }),
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/resource/HD%20Ticket%20Comment?');
    expect(String(url)).toContain(encodeURIComponent('reference_ticket'));
    expect(init.headers.Authorization).toBe('token example-read-key:example-read-secret');
  });

  it('adds a ticket comment using the write token', async () => {
    setConfigured();
    const fetchMock = jest.fn().mockResolvedValue(
      Response.json({
        data: { name: 'c2', content: 'a reply', commented_by: null, creation: 't2' },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { addHelpdeskTicketComment } = require('../../../lib/server/frappe-helpdesk');
    const comment = await addHelpdeskTicketComment('HD-0001', 'a reply');

    expect(comment).toEqual(expect.objectContaining({ id: 'c2', content: 'a reply', commentedBy: null }));
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('token example-write-key:example-write-secret');
    expect(JSON.parse(init.body)).toEqual({ reference_ticket: 'HD-0001', content: 'a reply' });
  });

  it('wraps a network failure as a 502 FrappeHelpdeskRequestError', async () => {
    setConfigured();
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as unknown as typeof fetch;

    const { getHelpdeskTicket, FrappeHelpdeskRequestError } = require('../../../lib/server/frappe-helpdesk');
    await expect(getHelpdeskTicket('HD-0001')).rejects.toMatchObject({
      status: 502,
    });
    await expect(getHelpdeskTicket('HD-0001')).rejects.toBeInstanceOf(FrappeHelpdeskRequestError);
  });

  it('closes a ticket through the write API and serializes the updated ticket', async () => {
    setConfigured();
    const fetchMock = jest.fn().mockResolvedValue(Response.json({
      data: { name: 'HD-0001', subject: 'Help', status: 'Closed', priority: 'Medium', raised_by: 'a@example.com', creation: 't1', modified: 't2' },
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { closeHelpdeskTicket } = require('../../../lib/server/frappe-helpdesk');
    await expect(closeHelpdeskTicket('HD-0001')).resolves.toEqual(expect.objectContaining({ id: 'HD-0001', status: 'Closed', updatedAt: 't2' }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://helpdesk.example.com/api/resource/HD%20Ticket/HD-0001');
    expect(init).toEqual(expect.objectContaining({ method: 'PUT' }));
    expect(JSON.parse(init.body)).toEqual({ status: 'Closed' });
  });

  it('allows only the declared image and PDF attachment content types', () => {
    const { isAllowedAttachmentType } = require('../../../lib/server/frappe-helpdesk');
    expect(isAllowedAttachmentType('IMAGE/PNG')).toBe(true);
    expect(isAllowedAttachmentType('application/pdf')).toBe(true);
    expect(isAllowedAttachmentType('text/html')).toBe(false);
  });

  it('uploads a private attachment associated with the ticket', async () => {
    setConfigured();
    const fetchMock = jest.fn().mockResolvedValue(Response.json({ message: { name: 'FILE-0001', file_name: 'receipt.png' } }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { uploadHelpdeskAttachment } = require('../../../lib/server/frappe-helpdesk');

    await expect(uploadHelpdeskAttachment('HD-0001', { data: new Blob(['png'], { type: 'image/png' }), fileName: 'receipt.png' }))
      .resolves.toEqual({ fileId: 'FILE-0001', fileName: 'receipt.png' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://helpdesk.example.com/api/method/upload_file');
    expect(init.headers.Authorization).toBe('token example-write-key:example-write-secret');
    expect(init.body.get('is_private')).toBe('1');
    expect(init.body.get('doctype')).toBe('HD Ticket');
    expect(init.body.get('docname')).toBe('HD-0001');
  });

  it('rejects attachment uploads without write credentials and wraps upstream failures', async () => {
    process.env.FRAPPE_BASE_URL = 'https://helpdesk.example.com';
    const { uploadHelpdeskAttachment, FrappeHelpdeskConfigError, FrappeHelpdeskRequestError } = require('../../../lib/server/frappe-helpdesk');
    const input = { data: new Blob(['png'], { type: 'image/png' }), fileName: 'receipt.png' };
    await expect(uploadHelpdeskAttachment('HD-0001', input)).rejects.toBeInstanceOf(FrappeHelpdeskConfigError);

    setConfigured();
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    await expect(uploadHelpdeskAttachment('HD-0001', input)).rejects.toMatchObject({ status: 502 });
    global.fetch = jest.fn().mockResolvedValue(Response.json({ message: 'bad upload' }, { status: 400 })) as unknown as typeof fetch;
    await expect(uploadHelpdeskAttachment('HD-0001', input)).rejects.toBeInstanceOf(FrappeHelpdeskRequestError);
  });

  it('downloads an attachment only after confirming it belongs to the requested ticket', async () => {
    setConfigured();
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(Response.json({ data: { attached_to_doctype: 'HD Ticket', attached_to_name: 'HD-0001', file_url: '/private/files/receipt.png', file_name: 'receipt.png' } }))
      .mockResolvedValueOnce(new Response(new Uint8Array([4, 5, 6]), { headers: { 'content-type': 'image/png' } }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { fetchHelpdeskAttachment } = require('../../../lib/server/frappe-helpdesk');
    const attachment = await fetchHelpdeskAttachment('HD-0001', 'FILE-0001');
    expect(new Uint8Array(attachment.body)).toEqual(new Uint8Array([4, 5, 6]));
    expect(attachment).toEqual(expect.objectContaining({ contentType: 'image/png', fileName: 'receipt.png' }));
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://helpdesk.example.com/private/files/receipt.png');
  });

  it('rejects attachment records that do not belong to the ticket and wraps download failures', async () => {
    setConfigured();
    const { fetchHelpdeskAttachment, FrappeHelpdeskRequestError } = require('../../../lib/server/frappe-helpdesk');
    global.fetch = jest.fn().mockResolvedValue(Response.json({ data: { attached_to_doctype: 'HD Ticket', attached_to_name: 'HD-other', file_url: '/private/files/nope.png' } })) as unknown as typeof fetch;
    await expect(fetchHelpdeskAttachment('HD-0001', 'FILE-0001')).rejects.toMatchObject({ status: 404 });

    global.fetch = jest.fn()
      .mockResolvedValueOnce(Response.json({ data: { attached_to_doctype: 'HD Ticket', attached_to_name: 'HD-0001', file_url: '/private/files/receipt.png' } }))
      .mockResolvedValueOnce(new Response('bad', { status: 502 })) as unknown as typeof fetch;
    await expect(fetchHelpdeskAttachment('HD-0001', 'FILE-0001')).rejects.toBeInstanceOf(FrappeHelpdeskRequestError);
  });
});
