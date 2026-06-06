/// <reference types="jest" />

const mockQuery = jest.fn();

jest.mock('@/lib/server/better-auth', () => ({
  getDatabasePool: jest.fn(() => ({
    query: mockQuery,
  })),
}));

describe('status api', () => {
  beforeEach(() => {
    jest.resetModules();
    mockQuery.mockReset();
  });

  it('returns 200 when the production database is reachable', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ updated_at: '2026-06-01T12:34:56.000Z' }],
      })
      .mockResolvedValueOnce({
        rows: [{ count: 4 }],
      })
      .mockResolvedValueOnce({
        rows: [{ count: 8 }],
      })
      .mockResolvedValueOnce({
        rows: [{ count: 2 }],
      })
      .mockResolvedValueOnce({
        rows: [{ count: 3 }],
      })
      .mockResolvedValueOnce({
        rows: [{ count: 5 }],
      })
      .mockResolvedValueOnce({
        rows: [{ count: 11 }],
      });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/status+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/status'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBeDefined();
    expect(body.services.database.status).toBe('healthy');
    expect(body.services.database.tables.event_agenda).toEqual({
      accessible: true,
      recordCount: 4,
    });
    expect(body.checks.agenda).toEqual({
      hasData: true,
      lastUpdated: '2026-06-01T12:34:56.000Z',
      itemCount: 4,
    });
    expect(body.checks.bookings.count).toBe(10);
    expect(body.services.api.endpoints['/api/status']).toEqual({ accessible: true });
  });
});
