/// <reference types="jest" />

const mockEq = jest.fn();
const mockOrder = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({ from: mockFrom }),
}));

describe('legacy BSL agenda compatibility route', () => {
  beforeEach(() => {
    jest.resetModules();
    mockEq.mockReset();
    mockOrder.mockReset();
    mockFrom.mockReset();
  });

  it('maps a legacy eventId query to the canonical event-scoped agenda read', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn(() => ({
        eq: (...args: unknown[]) => {
          mockEq(...args);
          return { order: mockOrder.mockResolvedValue({ data: [{ id: 'peru-session-1' }], error: null }) };
        },
      })),
    });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/bsl/agenda+api');
    const response = await GET(
      new Request('http://localhost:8081/api/bsl/agenda?eventId=peru2026'),
    );

    expect(response.status).toBe(200);
    expect(mockEq).toHaveBeenCalledWith('event_id', 'peru2026');
    expect(await response.json()).toEqual({ data: [{ id: 'peru-session-1' }] });
  });

  it('rejects a malformed legacy eventId before querying the database', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/bsl/agenda+api');
    const response = await GET(
      new Request('http://localhost:8081/api/bsl/agenda?eventId=not%20an%20event'),
    );

    expect(response.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
