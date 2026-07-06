/// <reference types="jest" />

const mockQuery = jest.fn();
const mockGetDatabasePool = jest.fn(() => ({
  query: mockQuery,
}));
const mockHasDatabaseConnectionString = jest.fn();

jest.mock('@/lib/server/database-pool', () => ({
  getDatabasePool: () => mockGetDatabasePool(),
  hasDatabaseConnectionString: () => mockHasDatabaseConnectionString(),
}));

describe('status api', () => {
  beforeEach(() => {
    jest.resetModules();
    mockQuery.mockReset();
    mockGetDatabasePool.mockClear();
    mockHasDatabaseConnectionString.mockReset();
  });

  it('returns 200 when the production database is reachable', async () => {
    mockHasDatabaseConnectionString.mockReturnValue(true);

    mockQuery
      .mockResolvedValueOnce({
        rows: [{ ok: 1 }],
      })
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

  it('returns degraded health when the Better Auth database is not configured', async () => {
    mockHasDatabaseConnectionString.mockReturnValue(false);

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/status+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/status'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('degraded');
    expect(body.services.database.status).toBe('unhealthy');
    expect(body.services.database.tables.configuration).toEqual({
      accessible: false,
      error:
        'Database is not configured in this environment. Set BETTER_AUTH_DATABASE_URL, BSL_BETTER_AUTH_DATABASE_URL, BSL_DATABASE_URL, DATABASE_URL, SUPABASE_DB_URL_DEV, SUPABASE_DB_URL, or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD to enable internal status checks.',
    });
    expect(body.services.api.status).toBe('unhealthy');
    expect(body.services.api.endpoints['/api/status']).toEqual({ accessible: true });
    expect(body.services.api.endpoints['/api/bslatam/speakers']).toEqual({
      accessible: false,
      error:
        'Database is not configured in this environment. Set BETTER_AUTH_DATABASE_URL, BSL_BETTER_AUTH_DATABASE_URL, BSL_DATABASE_URL, DATABASE_URL, SUPABASE_DB_URL_DEV, SUPABASE_DB_URL, or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD to enable internal status checks.',
    });
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockGetDatabasePool).not.toHaveBeenCalled();
  });

  it('returns degraded health when the database probe fails', async () => {
    mockHasDatabaseConnectionString.mockReturnValue(true);
    mockQuery.mockRejectedValueOnce(new Error('connect ETIMEDOUT'));

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/status+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/status'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('degraded');
    expect(body.services.database.status).toBe('unhealthy');
    expect(body.services.database.tables.connection).toEqual({
      accessible: false,
      error: 'connect ETIMEDOUT',
    });
    expect(body.services.api.status).toBe('unhealthy');
    expect(body.services.api.endpoints['/api/status']).toEqual({ accessible: true });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
