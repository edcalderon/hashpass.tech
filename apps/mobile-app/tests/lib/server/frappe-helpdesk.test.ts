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
});
