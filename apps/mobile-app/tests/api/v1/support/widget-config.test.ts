/// <reference types="jest" />

describe('GET /api/v1/support/widget-config', () => {
  it('returns the known app config', async () => {
    const { GET } = require('../../../../app/api/v1/support/widget-config+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/v1/support/widget-config?appId=core'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({ appId: 'core', locale: 'en', position: 'bottom-right' }),
    );
  });

  it('returns 404 for an unknown app id', async () => {
    const { GET } = require('../../../../app/api/v1/support/widget-config+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/v1/support/widget-config?appId=not-real'));
    expect(response.status).toBe(404);
  });
});
