import { buildPublicCalendarItems, GET } from '../../app/api/calendar+api';

describe('public calendar API', () => {
  it('publishes only dated agenda items with inferred session endings', () => {
    const items = buildPublicCalendarItems({
      demo: {
        id: 'demo',
        name: 'Demo Event',
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
