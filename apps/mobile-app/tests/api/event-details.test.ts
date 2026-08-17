/// <reference types="jest" />

const mockEq = jest.fn();
const mockIn = jest.fn();
const mockMaybeSingle = jest.fn();
const mockFrom = jest.fn();
let consoleErrorSpy: jest.SpyInstance;

jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({ from: mockFrom }),
}));

function detailsQuery(result: { data: unknown | null; error: unknown }) {
  return {
    select: jest.fn(() => ({
      eq: (...args: unknown[]) => {
        mockEq(...args);
        return {
          in: (...inArgs: unknown[]) => {
            mockIn(...inArgs);
            return { maybeSingle: mockMaybeSingle.mockResolvedValue(result) };
          },
        };
      },
    })),
  };
}

describe('event details api', () => {
  beforeEach(() => {
    jest.resetModules();
    mockEq.mockReset();
    mockIn.mockReset();
    mockMaybeSingle.mockReset();
    mockFrom.mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleErrorSpy.mockRestore());

  it('returns the event row for a published/archived event id from the URL', async () => {
    const row = {
      id: 'colombia2026',
      name: 'Blockchain Summit Latam Colombia 2026',
      description: 'Real DB description',
      venue_name: 'Bogotá venue',
      venue_address: '123 Main St',
      city: 'Bogotá',
      country: 'Colombia',
    };
    mockFrom.mockReturnValue(detailsQuery({ data: row, error: null }));

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/events/[eventId]/details+api');
    const response = await GET(
      new Request('https://api.hashpass.tech/api/events/colombia2026/details'),
    );

    expect(response.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith('events');
    expect(mockEq).toHaveBeenCalledWith('id', 'colombia2026');
    expect(mockIn).toHaveBeenCalledWith('status', ['published', 'archived']);
    expect(await response.json()).toEqual({ data: row });
  });

  it('returns null data (not an error) for an event with no row yet, e.g. an ingested event', async () => {
    mockFrom.mockReturnValue(detailsQuery({ data: null, error: null }));

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/events/[eventId]/details+api');
    const response = await GET(
      new Request('https://api.hashpass.tech/api/events/hash-poker/details'),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: null });
  });

  it('returns a safe error when the lookup fails', async () => {
    mockFrom.mockReturnValue(
      detailsQuery({ data: null, error: new Error('offline') }),
    );

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/events/[eventId]/details+api');
    const response = await GET(
      new Request('https://api.hashpass.tech/api/events/colombia2026/details'),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to load event details' });
  });

  it('rejects a route without a valid event id', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/events/[eventId]/details+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/events'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'A valid event id is required' });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
