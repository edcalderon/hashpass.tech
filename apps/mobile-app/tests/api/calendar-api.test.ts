import { buildPublicCalendarItems, GET } from '../../app/api/calendar+api';

describe('public calendar API', () => {
  it('publishes only dated agenda items with inferred session endings', () => {
    const items = buildPublicCalendarItems({
      demo: {
        id: 'demo',
        name: 'Demo Event',
        eventStartDate: '2026-12-12T09:00:00-05:00',
        agenda: [
          {
            id: 'opening',
            title: 'Opening',
            time: '2026-12-12T09:00:00-05:00',
            location: 'Main Stage',
          },
          {
            id: 'panel',
            title: 'Panel',
            time: '2026-12-12T10:00:00-05:00',
          },
          { id: 'draft', title: 'Draft', time: 'not-a-date' },
        ],
      },
    } as any);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      uid: 'demo-opening@hashpass.tech',
      title: 'Demo Event: Opening',
      location: 'Main Stage',
    });
    expect(items[0].end.toISOString()).toBe('2026-12-12T15:00:00.000Z');
    expect(items[1].end.toISOString()).toBe('2026-12-12T15:45:00.000Z');
  });

  it('resolves local agenda ranges against the event date and agenda day', () => {
    const items = buildPublicCalendarItems({
      colombia: {
        id: 'colombia',
        name: 'Colombia Summit',
        eventStartDate: '2026-08-05T09:00:00-05:00',
        agenda: [
          { id: 'welcome', title: 'Welcome', time: '08:00 - 09:00', day: '1' },
          {
            id: 'keynote',
            title: 'Keynote',
            time: '10:00',
            day: '1',
            end_time: '2026-08-05T11:30:00-05:00',
          },
          { id: 'night', title: 'Night session', time: '23:30 - 00:30', day: '2' },
          { id: 'draft', title: 'Draft', time: '08:00 - 09:00' },
        ],
      },
    } as any);

    expect(items).toHaveLength(4);
    const welcome = items.find((item) => item.uid === 'colombia-welcome@hashpass.tech');
    const keynote = items.find((item) => item.uid === 'colombia-keynote@hashpass.tech');
    const night = items.find((item) => item.uid === 'colombia-night@hashpass.tech');

    expect(welcome?.start.toISOString()).toBe('2026-08-05T13:00:00.000Z');
    expect(welcome?.end.toISOString()).toBe('2026-08-05T14:00:00.000Z');
    expect(keynote?.end.toISOString()).toBe('2026-08-05T16:30:00.000Z');
    expect(night?.start.toISOString()).toBe('2026-08-07T04:30:00.000Z');
    expect(night?.end.toISOString()).toBe('2026-08-07T05:30:00.000Z');
  });

  it('serves a subscribable iCalendar response', async () => {
    const response = await GET();
    const body = await response.text();

    expect(response.headers.get('content-type')).toBe(
      'text/calendar; charset=utf-8',
    );
    expect(response.headers.get('content-disposition')).toContain(
      'hashpass-events.ics',
    );
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('END:VCALENDAR');
  });
});
