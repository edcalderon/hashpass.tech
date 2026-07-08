/// <reference types="jest" />

const loadIpquery = () => {
  jest.resetModules();
  return require('../../lib/ipquery');
};

describe('ipquery geolocation helpers', () => {
  const originalFetch = global.fetch;
  const originalDateTimeFormat = Intl.DateTimeFormat;

  afterEach(() => {
    global.fetch = originalFetch;
    Intl.DateTimeFormat = originalDateTimeFormat;
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('maps the ipquery response and caches the request', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        ip: '203.0.113.10',
        location: {
          country: 'Germany',
          country_code: 'DE',
          city: 'Berlin',
          state: 'Berlin',
          timezone: 'Europe/Berlin',
          latitude: 52.52,
          longitude: 13.405,
        },
      }),
    }));
    global.fetch = fetchMock as any;

    const { fetchIPLocation, isGDPRCountry, GDPR_COUNTRY_CODES } = loadIpquery();

    await expect(fetchIPLocation()).resolves.toEqual({
      ip: '203.0.113.10',
      country: 'Germany',
      country_code: 'DE',
      city: 'Berlin',
      state: 'Berlin',
      timezone: 'Europe/Berlin',
      latitude: 52.52,
      longitude: 13.405,
    });
    await expect(fetchIPLocation()).resolves.toEqual(
      expect.objectContaining({ country_code: 'DE' })
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://api.ipquery.io/', expect.objectContaining({
      headers: { Accept: 'application/json' },
      signal: expect.any(Object),
    }));
    expect(GDPR_COUNTRY_CODES.has('DE')).toBe(true);
    expect(isGDPRCountry('de')).toBe(true);
    expect(isGDPRCountry('US')).toBe(false);
  });

  it('returns null when the remote service is unavailable', async () => {
    global.fetch = jest.fn(async () => ({ ok: false })) as any;
    const { fetchIPLocation } = loadIpquery();

    await expect(fetchIPLocation()).resolves.toBeNull();
  });

  it('falls back to the browser timezone for GDPR jurisdiction detection', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('network unavailable');
    }) as any;
    Intl.DateTimeFormat = jest.fn(() => ({
      resolvedOptions: () => ({ timeZone: 'Europe/Madrid' }),
    })) as any;

    const { isGDPRJurisdiction } = loadIpquery();

    await expect(isGDPRJurisdiction()).resolves.toBe(true);
  });
});
