import { GET, OPTIONS } from '../../../app/api/auth/mcp-consent-query+api';

const mockGetAuth = jest.fn();
const mockVerifySignedOAuthQuery = jest.fn();

jest.mock('../../../lib/server/better-auth', () => ({ getAuth: () => mockGetAuth() }));
jest.mock('../../../lib/server/verify-signed-oauth-query', () => ({
  verifySignedOAuthQuery: (...args: unknown[]) => mockVerifySignedOAuthQuery(...args),
}));

const request = (query = '', origin = 'https://hashpass.tech') =>
  new Request(`https://api.hashpass.tech/api/auth/mcp-consent-query${query}`, {
    headers: { origin },
  });

describe('MCP consent query API', () => {
  beforeEach(() => jest.clearAllMocks());

  it('handles CORS preflight only for approved origins', () => {
    const allowed = OPTIONS(request());
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://hashpass.tech');

    const denied = OPTIONS(request('', 'https://evil.example'));
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('returns 503 when Better Auth is unavailable', async () => {
    mockGetAuth.mockReturnValue(null);
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Authentication service unavailable' });
  });

  it('rejects missing, invalid, and expired signed requests', async () => {
    mockGetAuth.mockReturnValue({ $context: Promise.resolve({ secret: 'secret' }) });
    mockVerifySignedOAuthQuery.mockResolvedValue(false);

    expect((await GET(request())).status).toBe(400);
    expect((await GET(request('?client_id=chatgpt&sig=invalid'))).status).toBe(400);
    expect(mockVerifySignedOAuthQuery).toHaveBeenCalledWith('client_id=chatgpt&sig=invalid', 'secret');
  });

  it('returns verified client and scope details without caching', async () => {
    mockGetAuth.mockReturnValue({ $context: Promise.resolve({ secret: 'secret' }) });
    mockVerifySignedOAuthQuery.mockResolvedValue(true);

    const response = await GET(request('?client_id=chatgpt&scope=openid+plane%3Aread&sig=valid'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ clientId: 'chatgpt', scopes: ['openid', 'plane:read'] });
  });
});
