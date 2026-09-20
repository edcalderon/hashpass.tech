/// <reference types="jest" />

const mockRpc = jest.fn();
const mockGetSupabaseServerForRequest = jest.fn((_request: Request) => ({ rpc: mockRpc }));

jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: (request: Request) => mockGetSupabaseServerForRequest(request),
}));

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://api.hashpass.tech/api/v1/support/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hashpass-app-id': 'core', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/support/sessions', () => {
  beforeEach(() => {
    jest.resetModules();
    mockRpc.mockReset();
    mockGetSupabaseServerForRequest.mockClear();
    mockRpc.mockResolvedValue({
      data: [{ session_id: 'session-1', visitor_id: 'visitor-1' }],
      error: null,
    });
  });

  it('rejects an unknown app id', async () => {
    const { POST } = require('../../../../app/api/v1/support/sessions+api');
    const response = await POST(makeRequest({}, { 'x-hashpass-app-id': 'not-a-real-app' }));
    expect(response.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects a missing app id header', async () => {
    const { POST } = require('../../../../app/api/v1/support/sessions+api');
    const request = new Request('https://api.hashpass.tech/api/v1/support/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const response = await POST(request);
    expect(response.status).toBe(404);
  });

  it('creates an anonymous session for a known app id', async () => {
    const { POST } = require('../../../../app/api/v1/support/sessions+api');
    const response = await POST(makeRequest({}));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({
        token: expect.any(String),
        visitorId: 'visitor-1',
        applicationId: 'core',
        expiresAt: expect.any(String),
      }),
    );
    expect(mockRpc).toHaveBeenCalledWith(
      'create_support_session',
      expect.objectContaining({ p_app_id: 'core' }),
    );
  });

  it('passes identity fields through to create_support_session for identify calls', async () => {
    const { POST } = require('../../../../app/api/v1/support/sessions+api');
    await POST(makeRequest({ identity: { email: 'visitor@example.com', name: 'Visitor' } }));

    expect(mockRpc).toHaveBeenCalledWith(
      'create_support_session',
      expect.objectContaining({ p_email: 'visitor@example.com', p_name: 'Visitor' }),
    );
  });
});
