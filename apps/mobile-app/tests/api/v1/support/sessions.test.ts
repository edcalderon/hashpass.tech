/// <reference types="jest" />

const mockRpc = jest.fn();
const mockGetUser = jest.fn();
const mockGetSupabaseServerForRequest = jest.fn((_request: Request) => ({ rpc: mockRpc, auth: { getUser: mockGetUser } }));

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
    mockGetUser.mockReset();
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

  it('rejects unverified claimed identities', async () => {
    const { POST } = require('../../../../app/api/v1/support/sessions+api');
    const response = await POST(makeRequest({ identity: { email: 'victim@example.com' } }));
    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('uses only the verified bearer identity when identifying a visitor', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'verified@example.com', user_metadata: { name: 'Verified' } } },
      error: null,
    });
    const { POST } = require('../../../../app/api/v1/support/sessions+api');
    const response = await POST(makeRequest(
      { identity: { email: 'victim@example.com', externalId: 'victim', name: 'Display Name' } },
      { authorization: 'Bearer primary-token' },
    ));
    expect(response.status).toBe(200);
    expect(mockGetUser).toHaveBeenCalledWith('primary-token');
    expect(mockRpc).toHaveBeenCalledWith(
      'create_support_session',
      expect.objectContaining({ p_external_id: 'user-1', p_email: 'verified@example.com', p_name: 'Display Name' }),
    );
  });
});
