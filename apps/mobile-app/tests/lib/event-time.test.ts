import { parseAgendaTime } from '../../lib/event-time';

describe('parseAgendaTime', () => {
  it('keeps an absolute ISO timestamp unchanged', () => {
    const parsed = parseAgendaTime('2026-08-05T08:30:00-04:00', '2026-08-05T09:00:00-04:00', '1', '-04:00');
    expect(parsed.toISOString()).toBe('2026-08-05T12:30:00.000Z');
  });

  it('resolves a wall-clock range against the event date and day', () => {
    const parsed = parseAgendaTime('08:30-09:30', '2026-08-05T09:00:00-04:00', '2', '-04:00');
    expect(parsed.toISOString()).toBe('2026-08-06T12:30:00.000Z');
  });

  it('returns an invalid date when a range has no event date', () => {
    expect(Number.isNaN(parseAgendaTime('08:30-09:30').getTime())).toBe(true);
  });
});
