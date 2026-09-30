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

    // content comes back exactly as passed in (marker stripped/never leaked
    // to the caller) and isVisitorReply is unconditionally true -- every
    // caller of this function is a visitor-authored write.
    expect(comment).toEqual(
      expect.objectContaining({ id: 'c2', content: 'a reply', commentedBy: null, isVisitorReply: true }),
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('token example-write-key:example-write-secret');
    // The wire body carries the invisible visitor-reply marker appended --
    // see VISITOR_REPLY_MARKER -- so a later poll can tell this comment apart
    // from one a real agent typed directly in the Frappe Helpdesk UI.
    expect(JSON.parse(init.body)).toEqual({
      reference_ticket: 'HD-0001',
      content: 'a reply<!--hashpass:visitor-reply-->',
    });
  });

  it('marks a listed comment as a visitor reply and strips the marker when Frappe echoes it back', async () => {
    setConfigured();
    global.fetch = jest.fn().mockResolvedValue(
      Response.json({
        message: [
          {
            name: 'c3',
            content: 'thanks!<!--hashpass:visitor-reply-->',
            commented_by: 'support-api@hashpass.tech',
            creation: 't3',
          },
          { name: 'c4', content: 'we are looking into it', commented_by: 'agent@hashpass.tech', creation: 't4' },
        ],
      }),
    ) as unknown as typeof fetch;

    const { listHelpdeskTicketComments } = require('../../../lib/server/frappe-helpdesk');
    const comments = await listHelpdeskTicketComments('HD-0001');

    expect(comments).toEqual([
      expect.objectContaining({ id: 'c3', content: 'thanks!', isVisitorReply: true }),
      expect.objectContaining({ id: 'c4', content: 'we are looking into it', isVisitorReply: false }),
    ]);
  });

  it('closes a ticket via PUT using the write token', async () => {
    setConfigured();
    const fetchMock = jest.fn().mockResolvedValue(
      Response.json({
        data: {
          name: 'HD-0001',
          subject: 'Help',
          status: 'Closed',
          priority: 'Medium',
          raised_by: 'a@example.com',
          creation: 't1',
          modified: 't2',
        },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { closeHelpdeskTicket } = require('../../../lib/server/frappe-helpdesk');
    const ticket = await closeHelpdeskTicket('HD-0001');

    expect(ticket).toEqual(expect.objectContaining({ id: 'HD-0001', status: 'Closed' }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://helpdesk.example.com/api/resource/HD%20Ticket/HD-0001');
    expect(init.method).toBe('PUT');
    expect(init.headers.Authorization).toBe('token example-write-key:example-write-secret');
    expect(JSON.parse(init.body)).toEqual({ status: 'Closed' });
  });

  describe('isAllowedAttachmentType', () => {
    it('allows the documented image/PDF mime types, case-insensitively', () => {
      const { isAllowedAttachmentType } = require('../../../lib/server/frappe-helpdesk');
      expect(isAllowedAttachmentType('image/png')).toBe(true);
      expect(isAllowedAttachmentType('IMAGE/JPEG')).toBe(true);
      expect(isAllowedAttachmentType('application/pdf')).toBe(true);
    });

    it('rejects an unlisted mime type', () => {
      const { isAllowedAttachmentType } = require('../../../lib/server/frappe-helpdesk');
      expect(isAllowedAttachmentType('application/zip')).toBe(false);
      expect(isAllowedAttachmentType('text/html')).toBe(false);
    });
  });

  describe('uploadHelpdeskAttachment', () => {
    it('throws FrappeHelpdeskConfigError when the write credentials are missing', async () => {
      process.env.FRAPPE_BASE_URL = 'https://helpdesk.example.com';
      delete process.env.FRAPPE_SUPPORT_WRITE_API_KEY;
      delete process.env.FRAPPE_SUPPORT_WRITE_API_SECRET;
      const { uploadHelpdeskAttachment, FrappeHelpdeskConfigError } = require('../../../lib/server/frappe-helpdesk');

      await expect(
        uploadHelpdeskAttachment('HD-0001', { data: new Blob(['x']), fileName: 'a.png' }),
      ).rejects.toBeInstanceOf(FrappeHelpdeskConfigError);
    });

    it('uploads the file as a private attachment on the ticket, using the write token', async () => {
      setConfigured();
      const fetchMock = jest.fn().mockResolvedValue(
        Response.json({ message: { name: 'file-1', file_name: 'a.png' } }),
      );
      global.fetch = fetchMock as unknown as typeof fetch;

      const { uploadHelpdeskAttachment } = require('../../../lib/server/frappe-helpdesk');
      const result = await uploadHelpdeskAttachment('HD-0001', { data: new Blob(['x']), fileName: 'a.png' });

      expect(result).toEqual({ fileId: 'file-1', fileName: 'a.png' });
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toBe('https://helpdesk.example.com/api/method/upload_file');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('token example-write-key:example-write-secret');
      expect(init.body).toBeInstanceOf(FormData);
    });

    it('wraps a non-ok upload response as a FrappeHelpdeskRequestError', async () => {
      setConfigured();
      global.fetch = jest.fn().mockResolvedValue(
        Response.json({ message: 'too big' }, { status: 413 }),
      ) as unknown as typeof fetch;

      const { uploadHelpdeskAttachment, FrappeHelpdeskRequestError } = require('../../../lib/server/frappe-helpdesk');
      await expect(
        uploadHelpdeskAttachment('HD-0001', { data: new Blob(['x']), fileName: 'a.png' }),
      ).rejects.toBeInstanceOf(FrappeHelpdeskRequestError);
    });

    it('wraps a network failure during upload as a 502 FrappeHelpdeskRequestError', async () => {
      setConfigured();
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as unknown as typeof fetch;

      const { uploadHelpdeskAttachment, FrappeHelpdeskRequestError } = require('../../../lib/server/frappe-helpdesk');
      await expect(
        uploadHelpdeskAttachment('HD-0001', { data: new Blob(['x']), fileName: 'a.png' }),
      ).rejects.toMatchObject({ status: 502 });
      await expect(
        uploadHelpdeskAttachment('HD-0001', { data: new Blob(['x']), fileName: 'a.png' }),
      ).rejects.toBeInstanceOf(FrappeHelpdeskRequestError);
    });
  });

  describe('fetchHelpdeskAttachment', () => {
    it('throws FrappeHelpdeskConfigError when the read credentials are missing', async () => {
      process.env.FRAPPE_BASE_URL = 'https://helpdesk.example.com';
      delete process.env.FRAPPE_SUPPORT_READ_API_KEY;
      delete process.env.FRAPPE_SUPPORT_READ_API_SECRET;
      const { fetchHelpdeskAttachment, FrappeHelpdeskConfigError } = require('../../../lib/server/frappe-helpdesk');

      await expect(fetchHelpdeskAttachment('HD-0001', 'file-1')).rejects.toBeInstanceOf(FrappeHelpdeskConfigError);
    });

    it('rejects with a 404 when the file is not actually attached to this ticket', async () => {
      setConfigured();
      global.fetch = jest.fn().mockResolvedValue(
        Response.json({
          data: { attached_to_doctype: 'HD Ticket', attached_to_name: 'HD-9999', file_url: '/private/files/a.png' },
        }),
      ) as unknown as typeof fetch;

      const { fetchHelpdeskAttachment, FrappeHelpdeskRequestError } = require('../../../lib/server/frappe-helpdesk');
      await expect(fetchHelpdeskAttachment('HD-0001', 'file-1')).rejects.toBeInstanceOf(FrappeHelpdeskRequestError);
      await expect(fetchHelpdeskAttachment('HD-0001', 'file-1')).rejects.toMatchObject({ status: 404 });
    });

    it('downloads the file once ownership is verified, using the read token for both requests', async () => {
      setConfigured();
      const fileDocResponse = Response.json({
        data: {
          attached_to_doctype: 'HD Ticket',
          attached_to_name: 'HD-0001',
          file_url: '/private/files/a.png',
          file_name: 'a.png',
        },
      });
      const downloadResponse = new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
      const fetchMock = jest.fn().mockResolvedValueOnce(fileDocResponse).mockResolvedValueOnce(downloadResponse);
      global.fetch = fetchMock as unknown as typeof fetch;

      const { fetchHelpdeskAttachment } = require('../../../lib/server/frappe-helpdesk');
      const attachment = await fetchHelpdeskAttachment('HD-0001', 'file-1');

      expect(attachment.contentType).toBe('image/png');
      expect(attachment.fileName).toBe('a.png');
      expect(new Uint8Array(attachment.body)).toEqual(new Uint8Array([1, 2, 3]));
      const [, downloadInit] = fetchMock.mock.calls[1];
      expect(downloadInit.headers.Authorization).toBe('token example-read-key:example-read-secret');
    });

    it('wraps a non-ok download response as a FrappeHelpdeskRequestError', async () => {
      setConfigured();
      const fileDocResponse = Response.json({
        data: {
          attached_to_doctype: 'HD Ticket',
          attached_to_name: 'HD-0001',
          file_url: '/private/files/a.png',
          file_name: 'a.png',
        },
      });
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(fileDocResponse)
        .mockResolvedValueOnce(new Response('gone', { status: 410 }));
      global.fetch = fetchMock as unknown as typeof fetch;

      const { fetchHelpdeskAttachment, FrappeHelpdeskRequestError } = require('../../../lib/server/frappe-helpdesk');
      await expect(fetchHelpdeskAttachment('HD-0001', 'file-1')).rejects.toBeInstanceOf(FrappeHelpdeskRequestError);
    });

    it('wraps a network failure during download as a 502 FrappeHelpdeskRequestError', async () => {
      setConfigured();
      const fileDoc = {
        attached_to_doctype: 'HD Ticket',
        attached_to_name: 'HD-0001',
        file_url: '/private/files/a.png',
        file_name: 'a.png',
      };
      global.fetch = jest.fn().mockImplementation((input: unknown) =>
        String(input).includes('resource/File')
          ? Promise.resolve(Response.json({ data: fileDoc }))
          : Promise.reject(new Error('ECONNRESET')),
      ) as unknown as typeof fetch;

      const { fetchHelpdeskAttachment, FrappeHelpdeskRequestError } = require('../../../lib/server/frappe-helpdesk');
      const error = await fetchHelpdeskAttachment('HD-0001', 'file-1').catch((err: unknown) => err);
      expect(error).toBeInstanceOf(FrappeHelpdeskRequestError);
      expect(error).toMatchObject({ status: 502 });
    });
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
