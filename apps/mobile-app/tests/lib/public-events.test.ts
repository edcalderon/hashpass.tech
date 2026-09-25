import { filterPublicEvents, publicEventStatus } from '../../lib/public-events';
const now = Date.parse('2026-09-20T12:00:00Z');
const events: any[] = [
  { id: 'archive', title: 'Earlier', eventStartDate: '2025-01-01', eventEndDate: '2025-01-02' },
  { id: 'late', title: 'Late', eventStartDate: '2026-12-10', geo: { country: 'Colombia', continent: 'South America' } },
  { id: 'near', title: 'Bogotá Summit', eventStartDate: '2026-11-05', series: 'BSL', geo: { country: 'Colombia', continent: 'South America' } },
  { id: 'unknown', title: 'To be announced' },
  { id: 'main', title: 'Not an event' },
];
it('sorts real upcoming events first, then undated and archive entries', () => {
  expect(filterPublicEvents(events, {}, now).map(event => event.id)).toEqual(['near', 'late', 'unknown', 'archive']);
  expect(publicEventStatus(events[3], now)).toBe('undated');
});
it('combines accent-insensitive search with status, series and region filters', () => {
  expect(filterPublicEvents(events, { query: 'bogota colombia', status: 'upcoming', series: 'BSL', continent: 'South America' }, now).map(event => event.id)).toEqual(['near']);
  expect(filterPublicEvents(events, { status: 'past' }, now).map(event => event.id)).toEqual(['archive']);
  expect(filterPublicEvents(events, { query: 'not found' }, now)).toEqual([]);
});
it('uses the end time for in-progress events and never calls undated events upcoming', () => {
  expect(publicEventStatus({ eventStartDate: '2026-09-20', eventEndDate: '2026-09-21' } as any, now)).toBe('live');
  expect(filterPublicEvents(events, { status: 'upcoming' }, now).map(event => event.id)).toEqual(['near', 'late']);
});

it('allows an unfiltered public catalogue request without a filters argument', () => {
  expect(filterPublicEvents(events).map(event => event.id)).not.toContain('main');
  expect(filterPublicEvents(events, undefined, now)).toEqual(filterPublicEvents(events, {}, now));
});
