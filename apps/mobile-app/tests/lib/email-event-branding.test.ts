import { getEventEmailBranding } from '../../lib/email-event-branding';

describe('getEventEmailBranding', () => {
  it.each([
    ['bslchile2026', 'chile', '#bslchile2026'],
    ['BSL Colombia 2026', 'colombia', '#bslcolombia2026'],
    ['peru2027', 'peru', '#bslperu2027'],
  ])('uses the country-specific dark-header logo for %s', (eventId, country, eventTag) => {
    expect(getEventEmailBranding(eventId)).toMatchObject({
      isBsl: true,
      logoAssetPath: `logos/events/bsl/${country}/logo.png`,
      eventTag,
      eventUrl: 'https://blockchainsummit.la',
    });
  });

  it('uses the On Tour mark for a BSL event without a country', () => {
    expect(getEventEmailBranding('bsl2026')).toMatchObject({
      isBsl: true,
      logoAssetPath: 'logos/events/bsl/ontour/logo.png',
    });
  });

  it('does not add BSL branding for other events', () => {
    expect(getEventEmailBranding('hashpass-connect-2026')).toEqual({ isBsl: false });
  });
});
