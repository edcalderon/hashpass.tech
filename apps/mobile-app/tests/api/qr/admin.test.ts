/// <reference types="jest" />

const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockAuthenticateRequest = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

jest.mock('@/lib/bsl/rateLimit', () => ({
  rateLimitOk: jest.fn(() => true),
}));

jest.mock('@hashpass/auth', () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
}));

describe('GET/POST /api/qr/admin admin gate', () => {
  const userId = '7f60f5d2-5948-4df1-9670-2f9177cf2fe4';

  // Mocks the `checkAdminStatus` role lookup chain: .from().select().eq().in().limit()
  const mockRoleLookup = (result: unknown) => {
    const inFn = jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue(result) });
    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: inFn,
    });
    return { inFn };
  };

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
    mockAuthenticateRequest.mockReset();
    mockAuthenticateRequest.mockResolvedValue({ user: { id: userId }, error: null });
  });

  it('rejects a request when the caller has no admin role row', async () => {
    // Regression for: GET/POST here used to call the wrong `isAdmin` (the
    // @hashpass/auth one, which expects a user object with `.role` and always
    // returned false for a raw userId string) instead of this file's own
    // `checkAdminStatus(userId)`, which correctly reads the DB. Verify the
    // 403 path is driven by an actual DB result, not a permanently-broken check.
    const { inFn } = mockRoleLookup({ data: [], error: null });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../../app/api/qr/admin+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/qr/admin'));

    expect(inFn).toHaveBeenCalledWith('role', ['super_admin', 'admin']);
    expect(response.status).toBe(403);
  });

  it('allows a user whose user_roles row is admin to list QR codes', async () => {
    mockRoleLookup({ data: [{ role: 'admin' }], error: null });
    mockQrCodesQuery({ data: [], error: null, count: 0 });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../../app/api/qr/admin+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/qr/admin'));

    expect(response.status).toBe(200);
  });

  it('allows a super_admin to revoke a QR code', async () => {
    mockRoleLookup({ data: [{ role: 'super_admin' }], error: null });
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
