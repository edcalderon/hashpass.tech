/// <reference types="jest" />

const mockEq = jest.fn();
const mockOrder = jest.fn();
const mockFrom = jest.fn();
let consoleErrorSpy: jest.SpyInstance;

jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({ from: mockFrom }),
}));

function agendaQuery(result: { data: unknown[] | null; error: unknown }) {
  return {
    select: jest.fn(() => ({
      eq: (...args: unknown[]) => {
        mockEq(...args);
        return { order: mockOrder.mockResolvedValue(result) };
      },
    })),
  };
}

describe('event agenda api', () => {
  beforeEach(() => {
    jest.resetModules();
    mockEq.mockReset();
    mockOrder.mockReset();
    mockFrom.mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleErrorSpy.mockRestore());

  it('uses the event id from the URL when fetching agenda sessions', async () => {
    mockFrom.mockReturnValue(agendaQuery({ data: [{ id: 'session-1' }], error: null }));

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/events/[eventId]/agenda+api');
    const response = await GET(
      new Request('https://api.hashpass.tech/api/events/chile2026/agenda'),
    );

    expect(response.status).toBe(200);
    expect(mockEq).toHaveBeenCalledWith('event_id', 'chile2026');
    expect(await response.json()).toEqual({ data: [{ id: 'session-1' }] });
  });

  it('returns CORS metadata for preflight requests', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { OPTIONS } = require('../../app/api/events/[eventId]/agenda+api');
    const response = await OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS');
  });

  it('returns a safe error when the agenda query fails', async () => {
    mockFrom.mockReturnValue(agendaQuery({ data: null, error: new Error('offline') }));

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/events/[eventId]/agenda+api');
    const response = await GET(
      new Request('https://api.hashpass.tech/api/events/chile2026/agenda'),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to fetch agenda' });
  });

  it('rejects a route without an event id', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/events/[eventId]/agenda+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/events'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'A valid event id is required' });
  });
});
