/// <reference types="jest" />

const mockAuthorizeGlobalAdmin = jest.fn();
const mockEq = jest.fn();

jest.mock('@/lib/server/global-admin', () => ({
  authorizeGlobalAdmin: (...args: unknown[]) => mockAuthorizeGlobalAdmin(...args),
}));

describe('GET /api/v1/integrations/kapso/health', () => {
  beforeEach(() => {
    jest.resetModules();
    mockAuthorizeGlobalAdmin.mockReset();
    mockEq.mockReset();
    delete process.env.KAPSO_WEBHOOK_SECRET;
    delete process.env.KAPSO_API_KEY;
  });

  it('rejects a non-admin caller without querying the database', async () => {
    mockAuthorizeGlobalAdmin.mockResolvedValue({ response: Response.json({ error: 'Forbidden' }, { status: 403 }) });
    const { GET } = require('../../../../../app/api/v1/integrations/kapso/health+api');

    const response = await GET(new Request('https://api.hashpass.tech/api/v1/integrations/kapso/health'));

    expect(response.status).toBe(403);
    expect(mockEq).not.toHaveBeenCalled();
  });

  it('reports secret configuration and the unprocessed inbound event count', async () => {
    mockEq.mockResolvedValue({ count: 3, error: null });
    mockAuthorizeGlobalAdmin.mockResolvedValue({
      userId: 'admin-1',
      supabase: { from: () => ({ select: () => ({ eq: mockEq }) }) },
    });
    process.env.KAPSO_WEBHOOK_SECRET = 'example-fixture-value';

    const { GET } = require('../../../../../app/api/v1/integrations/kapso/health+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/v1/integrations/kapso/health'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      webhookSecretConfigured: true,
      apiKeyConfigured: false,
      unprocessedInboundEvents: 3,
      outboundSendingEnabled: false,
    });
  });

  it('returns 500 when the inbound-event count query fails', async () => {
    mockEq.mockResolvedValue({ count: null, error: { message: 'db down' } });
    mockAuthorizeGlobalAdmin.mockResolvedValue({
      userId: 'admin-1',
      supabase: { from: () => ({ select: () => ({ eq: mockEq }) }) },
    });

    const { GET } = require('../../../../../app/api/v1/integrations/kapso/health+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/v1/integrations/kapso/health'));

    expect(response.status).toBe(500);
  });
});
