/// <reference types="jest" />

const mockRpc = jest.fn();
const mockGetSupabaseServerForRequest = jest.fn((..._args: unknown[]) => ({ rpc: mockRpc }));

jest.mock('../../lib/supabase-server', () => ({
  getSupabaseServerForRequest: (...args: unknown[]) => mockGetSupabaseServerForRequest(...args),
}));

const request = (token?: string) =>
  new Request('https://api.hashpass.tech/api/internal/mission-control-metrics', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

describe('mission control aggregate metrics api', () => {
  const token = 'm'.repeat(32);

  beforeEach(() => {
    jest.resetModules();
    mockRpc.mockReset();
    mockGetSupabaseServerForRequest.mockClear();
    process.env.STATUS_METRICS_TOKEN = token;
  });

  afterEach(() => {
    delete process.env.STATUS_METRICS_TOKEN;
  });

  it('rejects missing or incorrect internal credentials before touching the database', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/internal/mission-control-metrics+api');

    expect((await GET(request())).status).toBe(401);
    expect((await GET(request('wrong'))).status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns only the aggregate RPC payload with no-store caching', async () => {
    const aggregate = {
      generatedAt: '2026-10-27T12:00:00.000Z',
      users: { total: 120, active30d: 44, new7d: 8 },
      activity: { verified30d: 230 },
      events: { total: 7, published: 5 },
      passes: { total: 91, active: 70 },
      meetings: { total: 32, scheduled: 11 },
      trends: { activeUsers7d: [3, 4, 4, 8, 7, 9, 11] },
    };
    mockRpc.mockResolvedValue({ data: aggregate, error: null });
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/internal/mission-control-metrics+api');

    const response = await GET(request(token));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ data: aggregate });
    expect(mockRpc).toHaveBeenCalledWith('mission_control_metrics');
  });

  it('fails closed when aggregate storage is unavailable', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'down' } });
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/internal/mission-control-metrics+api');

    const response = await GET(request(token));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Mission Control metrics are unavailable' });
  });
});
