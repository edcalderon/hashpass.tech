import {
  buildAppleCalendarSubscriptionUrl,
  buildCalendarFeedUrl,
  buildGoogleCalendarSubscriptionUrl,
  serializeCalendarFeed,
} from '../../lib/calendar-subscription';

describe('calendar subscriptions', () => {
  it('builds provider-safe subscription URLs', () => {
    const feed = buildCalendarFeedUrl('https://api.hashpass.tech/api/');

    expect(feed).toBe('https://api.hashpass.tech/api/calendar');
    expect(buildAppleCalendarSubscriptionUrl(feed)).toBe(
      'webcal://api.hashpass.tech/api/calendar',
    );

    const google = new URL(buildGoogleCalendarSubscriptionUrl(feed));
    expect(google.origin).toBe('https://calendar.google.com');
    expect(google.searchParams.get('cid')).toBe(feed);
  });

  it('preserves the development API origin for calendar feeds', () => {
    expect(buildCalendarFeedUrl('https://api-dev.hashpass.tech/api')).toBe(
      'https://api-dev.hashpass.tech/api/calendar',
    );
  });

  it('serializes valid, escaped calendar events with stable identifiers', () => {
    const calendar = serializeCalendarFeed(
      [
        {
          uid: 'event-session@hashpass.tech',
          title: 'Opening, welcome',
          description: 'Line one\nLine two',
          location: 'Stage; A',
          start: new Date('2026-12-12T14:00:00.000Z'),
          end: new Date('2026-12-12T14:45:00.000Z'),
          url: 'https://hashpass.tech/events/demo/agenda',
        },
      ],
      new Date('2026-10-03T12:00:00.000Z'),
    );

    expect(calendar).toContain('BEGIN:VCALENDAR\r\n');
    expect(calendar).toContain('UID:event-session@hashpass.tech\r\n');
    expect(calendar).toContain('DTSTART:20261212T140000Z\r\n');
    expect(calendar).toContain('SUMMARY:Opening\\, welcome\r\n');
    expect(calendar).toContain('DESCRIPTION:Line one\\nLine two\r\n');
    expect(calendar).toContain('LOCATION:Stage\\; A\r\n');
    expect(calendar.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
