// Single source of truth for "what time is it, in this event's own fixed
// timezone" — independent of the viewer's device/browser timezone.
//
// Before this existed, the same concept (parse an event timestamp, format
// its wall-clock time) was reimplemented separately in types/agenda.ts,
// app/events/[eventSlug]/networking/my-schedule.tsx, and
// components/ScheduleConfirmationModal.tsx (via date-fns' format(), which
// reads the *device's* local timezone). Each copy drifted independently:
// two used a hardcoded -05:00 (Medellín/Colombia) default regardless of the
// real event location, and the third ignored the event's timezone entirely.
// The result was the same session showing different times on different
// screens (e.g. the confirm modal showing 12:30 PM while the agenda card for
// the identical item showed the real 1:30 PM). Every screen that displays an
// event time should import from here instead of re-deriving its own offset
// math, so a future timezone or schedule change only needs to update one
// place.

// Fallback offset for events that don't specify their own via
// eventStartDate's trailing +/-HH:MM (BSL's original Medellín/Bogotá hub).
// Kept explicit so changed-file typechecks include this shared dependency.
export const DEFAULT_EVENT_TZ_OFFSET = '-05:00';

/** Extracts an event's real fixed UTC offset from its eventStartDate (e.g. "2026-08-05T09:00:00-04:00" -> "-04:00"). */
export const getEventTzOffset = (eventStartDate?: string | null): string =>
  eventStartDate?.match(/([+-]\d{2}:?\d{2})$/)?.[1] || DEFAULT_EVENT_TZ_OFFSET;

const endsWithZ = (s: string): boolean => /[zZ]$/.test(s);
const hasExplicitOffset = (s: string): boolean => /[+-]\d{2}:?\d{0,2}$/.test(s);

/**
 * Parses a timestamp as an absolute instant. If the string already carries
 * a real offset (including "Z"), that's trusted as-is. If it's naive
 * (no offset at all), it's assumed to be wall-clock time in the event's own
 * timezone (eventTzOffset), not the viewer's device timezone.
 */
export const parseEventISO = (s: string | null | undefined, eventTzOffset: string = DEFAULT_EVENT_TZ_OFFSET): Date => {
  if (!s) return new Date(NaN);
  if (endsWithZ(s) || hasExplicitOffset(s)) return new Date(s);
  return new Date(`${s}${eventTzOffset}`);
};

/**
 * Serializes a Date as an explicitly-offset ISO string ("+00:00") instead of
 * Date.toISOString()'s bare "Z" suffix. Needed whenever a *computed* instant
 * (e.g. start + duration) gets serialized and might later be re-parsed
 * through parseEventISO — a bare "Z" would be misread as naive/untagged and
 * reinterpreted using eventTzOffset, silently shifting an already-correct
 * absolute instant.
 */
export const toAbsoluteISO = (date: Date): string => date.toISOString().replace('Z', '+00:00');

/** Wall-clock hour/minute a Date represents in a *fixed* offset, independent of the viewer's device/browser timezone. */
export const eventClockParts = (date: Date, eventTzOffset: string = DEFAULT_EVENT_TZ_OFFSET): { hour: number; minute: number } => {
  const match = eventTzOffset.match(/^([+-])(\d{2}):?(\d{2})$/);
  const offsetMinutes = match
    ? (Number(match[2]) * 60 + Number(match[3])) * (match[1] === '-' ? -1 : 1)
    : -300;
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  return { hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() };
};

/** Formats a Date as "h:mm AM/PM" in the event's fixed timezone. */
export const formatEventClock = (date: Date, eventTzOffset: string = DEFAULT_EVENT_TZ_OFFSET, includeMinutes = true): string => {
  const { hour, minute } = eventClockParts(date, eventTzOffset);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return includeMinutes
    ? `${displayHour}:${minute.toString().padStart(2, '0')} ${ampm}`
    : `${displayHour} ${ampm}`;
};
