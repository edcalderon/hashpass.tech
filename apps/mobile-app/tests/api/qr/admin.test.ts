/// <reference types="jest" />

const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockAuthorizeGlobalAdmin = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

jest.mock('@/lib/bsl/rateLimit', () => ({
  rateLimitOk: jest.fn(() => true),
}));

jest.mock('@/lib/server/global-admin', () => ({
  authorizeGlobalAdmin: (...args: unknown[]) => mockAuthorizeGlobalAdmin(...args),
}));

describe('GET/POST /api/qr/admin admin gate', () => {
  const userId = '7f60f5d2-5948-4df1-9670-2f9177cf2fe4';

  const mockQrCodesQuery = (result: unknown) => {
    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    });
  };

  beforeEach(() => {
    jest.resetModules();
    mockFrom.mockReset();
    mockRpc.mockReset();
    mockAuthorizeGlobalAdmin.mockReset();
    mockAuthorizeGlobalAdmin.mockResolvedValue({
      userId,
      supabase: {
        from: (...args: unknown[]) => mockFrom(...args),
        rpc: (...args: unknown[]) => mockRpc(...args),
      },
    });
  });

  it('rejects a request when the linked account has no global admin role', async () => {
    mockAuthorizeGlobalAdmin.mockResolvedValueOnce({
      response: new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), { status: 403 }),
    });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../../app/api/qr/admin+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/qr/admin'));

    expect(response.status).toBe(403);
  });

  it('allows a linked global admin to list QR codes', async () => {
    mockQrCodesQuery({ data: [], error: null, count: 0 });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../../app/api/qr/admin+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/qr/admin'));

    expect(response.status).toBe(200);
  });

  it.each([
    ['suspend', 'POST', '../../../app/api/qr/admin/suspend+api'],
    ['reactivate', 'POST', '../../../app/api/qr/admin/reactivate+api'],
    ['scan logs', 'GET', '../../../app/api/qr/admin/logs+api'],
  ])('selects the event profile for opaque %s admin requests from the API host', async (_name, method, route) => {
    const request = new Request('https://api-dev.hashpass.tech/api/qr/admin', {
      method,
      headers: { origin: 'https://cbweek.hashpass.tech' },
      ...(method === 'POST' ? { body: JSON.stringify({}) } : {}),
    });
    if (_name === 'scan logs') mockQrCodesQuery({ data: [], error: null, count: 0 });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET, POST } = require(route);
    if (method === 'GET') await GET(request);
    else await POST(request);

    expect(mockAuthorizeGlobalAdmin).toHaveBeenCalledWith(request, 'bsl-development');
  });

  it('uses the linked Supabase user ID when revoking a QR code', async () => {
    mockRpc.mockReturnValue({ single: jest.fn().mockResolvedValue({ data: true, error: null }) });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../../app/api/qr/admin+api');
    const response = await POST(
      new Request('https://api.hashpass.tech/api/qr/admin', {
        method: 'POST',
        body: JSON.stringify({ token: 'qr-token-123' }),
      })
    );

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('revoke_qr_code', expect.objectContaining({
      p_token: 'qr-token-123',
      p_admin_user_id: userId,
    }));
  });
});
