import { getDefaultDurationMinutes } from '../types/agenda';
import type { AgendaItem } from '../types/agenda';
import type { AgendaNowPlacement, AgendaSessionWindow } from '../types/agenda-timeline.types';
import { parseAgendaTime } from './event-time';

const RANGE = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/;

/** Start and end of a session as absolute instants, or null when its time cannot be read. */
export function getAgendaSessionWindow(
  item: AgendaItem & { duration_minutes?: number },
  eventStartDate: string | null | undefined,
  eventTzOffset: string,
): AgendaSessionWindow | null {
  const start = parseAgendaTime(item.time, eventStartDate, item.day, eventTzOffset).getTime();
  if (Number.isNaN(start)) return null;
  const range = String(item.time || '').match(RANGE);
  if (range) {
    const minutes = (Number(range[3]) * 60 + Number(range[4])) - (Number(range[1]) * 60 + Number(range[2]));
    if (minutes > 0) return { start, end: start + minutes * 60_000 };
  }
  const duration = item.duration_minutes || getDefaultDurationMinutes(item.type);
  return { start, end: start + duration * 60_000 };
}

/** Calendar date (YYYY-MM-DD) of an instant in the event's own fixed offset. */
export function eventDateKey(instant: number, eventTzOffset: string): string {
  const match = eventTzOffset.match(/^([+-])(\d{2}):?(\d{2})$/);
  const offsetMinutes = match ? (Number(match[2]) * 60 + Number(match[3])) * (match[1] === '-' ? -1 : 1) : 0;
  return new Date(instant + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

/**
 * Places the current-time line against a day's sessions (already in chronological order).
 * Returns null when `now` is not on the day those sessions belong to, so the line only
 * tracks the clock on the day of the event.
 */
export function placeNowIndicator(
  windows: (AgendaSessionWindow | null)[],
  now: number,
  eventTzOffset: string,
): AgendaNowPlacement | null {
  const known = windows.map((window, index) => ({ window, index })).filter(
    (entry): entry is { window: AgendaSessionWindow; index: number } => entry.window !== null,
  );
  if (known.length === 0) return null;
  if (eventDateKey(known[0].window.start, eventTzOffset) !== eventDateKey(now, eventTzOffset)) return null;

  const current = known.find(({ window }) => now < window.end);
  if (!current) return { index: known[known.length - 1].index, mode: 'after' };
  if (now < current.window.start) return { index: current.index, mode: 'before' };
  const span = current.window.end - current.window.start;
  return { index: current.index, mode: 'within', fraction: span > 0 ? (now - current.window.start) / span : 0 };
}
