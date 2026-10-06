/// <reference types="jest" />

const mockGetBetterAuthSessionUser = jest.fn();

jest.mock('@/lib/server/better-auth-session-client', () => ({
  getBetterAuthSessionUser: (request: Request) => mockGetBetterAuthSessionUser(request),
}));

describe('Lukas session API', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetBetterAuthSessionUser.mockReset();
  });

  it('returns the restricted CORS preflight', async () => {
    const { OPTIONS } = require('../../app/api/lukas/session+api');
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://lukas.hashpass.tech');
  });

  it('requires an active HashPass session', async () => {
    mockGetBetterAuthSessionUser.mockResolvedValue(null);
    const { GET } = require('../../app/api/lukas/session+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/lukas/session'));
    expect(response.status).toBe(401);
  });

  it('returns the normalized connected user', async () => {
    mockGetBetterAuthSessionUser.mockResolvedValue({
      id: 'user-123', email: 'reader@example.com', first_name: 'Lukas', last_name: 'Reader',
    });
    const { GET } = require('../../app/api/lukas/session+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/lukas/session'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      user: { id: 'user-123', email: 'reader@example.com', name: 'Lukas Reader' },
    });
  });

  it('returns a safe error when session verification fails unexpectedly', async () => {
    mockGetBetterAuthSessionUser.mockRejectedValue(new Error('network failure'));
    const { GET } = require('../../app/api/lukas/session+api');
    expect((await GET(new Request('https://api.hashpass.tech/api/lukas/session'))).status).toBe(500);
  });
});
