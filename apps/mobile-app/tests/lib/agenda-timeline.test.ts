import { eventDateKey, getAgendaSessionWindow, placeNowIndicator } from '../../lib/agenda-timeline';

const TZ = '-05:00';
const START = '2026-08-05T08:00:00-05:00';
const at = (hhmm: string, day = '2026-08-05') => new Date(`${day}T${hhmm}:00-05:00`).getTime();
const win = (from: string, to: string, day?: string) => ({ start: at(from, day), end: at(to, day) });

describe('getAgendaSessionWindow', () => {
  it('reads wall-clock ranges, ISO starts with a default duration, and rejects unreadable times', () => {
    const range = getAgendaSessionWindow({ id: '1', title: 't', type: 'panel', time: '09:00-10:30', day: '1' }, START, TZ)!;
    expect(range.end - range.start).toBe(90 * 60_000);
    const iso = getAgendaSessionWindow({ id: '2', title: 't', type: 'keynote', time: '2026-08-05T09:00:00-05:00' }, START, TZ)!;
    expect(iso.end - iso.start).toBe(30 * 60_000);
    const explicit = getAgendaSessionWindow({ id: '3', title: 't', type: 'panel', time: '2026-08-05T09:00:00-05:00', duration_minutes: 45 }, START, TZ)!;
    expect(explicit.end - explicit.start).toBe(45 * 60_000);
    expect(getAgendaSessionWindow({ id: '4', title: 't', type: 'panel', time: 'soon' }, START, TZ)).toBeNull();
  });
});

describe('eventDateKey', () => {
  it('uses the event offset rather than the viewer timezone', () => {
    expect(eventDateKey(new Date('2026-08-06T02:00:00Z').getTime(), TZ)).toBe('2026-08-05');
    expect(eventDateKey(new Date('2026-08-06T02:00:00Z').getTime(), 'bad')).toBe('2026-08-06');
  });
});

describe('placeNowIndicator', () => {
  const day = [win('08:00', '09:00'), win('09:00', '10:00'), win('11:00', '12:00')];

  it('draws nothing when there are no readable sessions or it is not the event day', () => {
    expect(placeNowIndicator([null], at('08:30'), TZ)).toBeNull();
    expect(placeNowIndicator([], at('08:30'), TZ)).toBeNull();
    expect(placeNowIndicator(day, at('08:30', '2026-08-04'), TZ)).toBeNull();
    expect(placeNowIndicator(day, at('08:30', '2026-08-06'), TZ)).toBeNull();
  });

  it('runs across the session in progress with its progress fraction', () => {
    expect(placeNowIndicator(day, at('08:30'), TZ)).toEqual({ index: 0, mode: 'within', fraction: 0.5 });
    expect(placeNowIndicator(day, at('09:00'), TZ)).toEqual({ index: 1, mode: 'within', fraction: 0 });
  });

  it('sits in the gap above the next session between sessions and before the day starts', () => {
    expect(placeNowIndicator(day, at('10:30'), TZ)).toEqual({ index: 2, mode: 'before' });
    expect(placeNowIndicator(day, at('07:00'), TZ)).toEqual({ index: 0, mode: 'before' });
  });

  it('falls below the last session once the day is over, and skips unreadable sessions', () => {
    expect(placeNowIndicator(day, at('13:00'), TZ)).toEqual({ index: 2, mode: 'after' });
    expect(placeNowIndicator([null, win('08:00', '09:00')], at('08:30'), TZ)).toEqual({ index: 1, mode: 'within', fraction: 0.5 });
  });
});
