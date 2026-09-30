/// <reference types="jest" />

const mockCreateHelpdeskTicket = jest.fn();
const mockValidateToken = jest.fn();

jest.mock('@/lib/server/frappe-helpdesk', () => {
  const actual = jest.requireActual('@/lib/server/frappe-helpdesk');
  return {
    ...actual,
    createHelpdeskTicket: (...args: unknown[]) => mockCreateHelpdeskTicket(...args),
  };
});

jest.mock('@/lib/cap-instance', () => ({
  __esModule: true,
  default: { validateToken: (...args: unknown[]) => mockValidateToken(...args) },
}));

function makeRequest(body: unknown) {
  return new Request('https://api.hashpass.tech/api/v1/support/frappe/tickets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/support/frappe/tickets', () => {
  beforeEach(() => {
    jest.resetModules();
    mockCreateHelpdeskTicket.mockReset();
    mockValidateToken.mockReset();
  });

  it('rejects an invalid email before calling Frappe', async () => {
    const { POST } = require('../../../../../app/api/v1/support/frappe/tickets+api');

    const response = await POST(makeRequest({ email: 'not-an-email', subject: 'Help', message: 'hi' }));

    expect(response.status).toBe(400);
    expect(mockCreateHelpdeskTicket).not.toHaveBeenCalled();
  });

  it('rejects a missing subject or message before calling Frappe', async () => {
    const { POST } = require('../../../../../app/api/v1/support/frappe/tickets+api');

    const response = await POST(makeRequest({ email: 'a@example.com', subject: '  ', message: '' }));

    expect(response.status).toBe(400);
    expect(mockCreateHelpdeskTicket).not.toHaveBeenCalled();
  });

  it('creates a ticket and appends the free-text context to the description', async () => {
    mockCreateHelpdeskTicket.mockResolvedValue({
      id: 'HD-0001',
      subject: 'Help',
      status: 'Open',
      priority: 'Medium',
      raisedBy: 'a@example.com',
      createdAt: 't1',
      updatedAt: 't1',
    });

    const { POST } = require('../../../../../app/api/v1/support/frappe/tickets+api');
    const response = await POST(
      makeRequest({ email: 'a@example.com', subject: 'Help', message: 'I need help', context: 'app v1.9.82' }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.ticket).toEqual(expect.objectContaining({ id: 'HD-0001', raisedBy: 'a@example.com' }));
    expect(mockCreateHelpdeskTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Help',
        raisedBy: 'a@example.com',
        description: 'I need help\n\n---\napp v1.9.82',
      }),
    );
  });

  it('maps a Frappe config error to a 500 without leaking the underlying message', async () => {
    const { FrappeHelpdeskConfigError } = jest.requireActual('../../../../../lib/server/frappe-helpdesk');
    mockCreateHelpdeskTicket.mockRejectedValue(new FrappeHelpdeskConfigError('FRAPPE_BASE_URL is not configured'));

    const { POST } = require('../../../../../app/api/v1/support/frappe/tickets+api');
    const response = await POST(makeRequest({ email: 'a@example.com', subject: 'Help', message: 'hi' }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.message).not.toMatch(/FRAPPE_BASE_URL/);
  });

  it('maps a Frappe request error to a 502', async () => {
    const { FrappeHelpdeskRequestError } = jest.requireActual('../../../../../lib/server/frappe-helpdesk');
    mockCreateHelpdeskTicket.mockRejectedValue(new FrappeHelpdeskRequestError('boom', 500));

    const { POST } = require('../../../../../app/api/v1/support/frappe/tickets+api');
    const response = await POST(makeRequest({ email: 'a@example.com', subject: 'Help', message: 'hi' }));

    expect(response.status).toBe(502);
  });

  it('does not require a captcha token from a native request', async () => {
    mockCreateHelpdeskTicket.mockResolvedValue({
      id: 'HD-0001',
      subject: 'Help',
      status: 'Open',
      priority: 'Medium',
      raisedBy: 'a@example.com',
      createdAt: 't1',
      updatedAt: 't1',
    });

    const { POST } = require('../../../../../app/api/v1/support/frappe/tickets+api');
    const response = await POST(
      makeRequest({ email: 'a@example.com', subject: 'Help', message: 'hi', source: 'native' }),
    );

    expect(response.status).toBe(201);
    expect(mockValidateToken).not.toHaveBeenCalled();
  });

  it('treats a web-labeled request with no captcha token as native (nothing to validate)', async () => {
    mockCreateHelpdeskTicket.mockResolvedValue({
      id: 'HD-0001',
      subject: 'Help',
      status: 'Open',
      priority: 'Medium',
      raisedBy: 'a@example.com',
      createdAt: 't1',
      updatedAt: 't1',
    });

    // `source: 'web'` alone isn't the gate -- an absent captchaToken means
    // isNative stays true (see the route's `source === 'native' ||
    // !captchaToken` check), same as subscribe+api.ts's identical pattern.
    // The real gate is exercised by the next two tests, once a token is
    // actually present.
    const { POST } = require('../../../../../app/api/v1/support/frappe/tickets+api');
    const response = await POST(
      makeRequest({ email: 'a@example.com', subject: 'Help', message: 'hi', source: 'web' }),
    );

    expect(response.status).toBe(201);
    expect(mockValidateToken).not.toHaveBeenCalled();
    expect(mockCreateHelpdeskTicket).toHaveBeenCalled();
  });

  it('rejects a web request with an invalid or expired captcha token', async () => {
    mockValidateToken.mockResolvedValue({ success: false });

    const { POST } = require('../../../../../app/api/v1/support/frappe/tickets+api');
    const response = await POST(
      makeRequest({ email: 'a@example.com', subject: 'Help', message: 'hi', source: 'web', captchaToken: 'bad-token' }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.captchaExpired).toBe(true);
    expect(mockCreateHelpdeskTicket).not.toHaveBeenCalled();
  });

  it('creates the ticket once a web request presents a valid captcha token', async () => {
    mockValidateToken.mockResolvedValue({ success: true });
    mockCreateHelpdeskTicket.mockResolvedValue({
      id: 'HD-0001',
      subject: 'Help',
      status: 'Open',
      priority: 'Medium',
      raisedBy: 'a@example.com',
      createdAt: 't1',
      updatedAt: 't1',
    });

    const { POST } = require('../../../../../app/api/v1/support/frappe/tickets+api');
    const response = await POST(
      makeRequest({ email: 'a@example.com', subject: 'Help', message: 'hi', source: 'web', captchaToken: 'good-token' }),
    );

    expect(response.status).toBe(201);
    expect(mockValidateToken).toHaveBeenCalledWith('good-token');
    expect(mockCreateHelpdeskTicket).toHaveBeenCalled();
  });

  it('rate limits repeated requests from the same email', async () => {
    mockCreateHelpdeskTicket.mockResolvedValue({
      id: 'HD-0001',
      subject: 'Help',
      status: 'Open',
      priority: 'Medium',
      raisedBy: 'a@example.com',
      createdAt: 't1',
      updatedAt: 't1',
    });
    const { POST } = require('../../../../../app/api/v1/support/frappe/tickets+api');

    let lastResponse;
    for (let i = 0; i < 6; i += 1) {
      lastResponse = await POST(makeRequest({ email: 'a@example.com', subject: 'Help', message: 'hi' }));
    }

    expect(lastResponse!.status).toBe(429);
  });
});
