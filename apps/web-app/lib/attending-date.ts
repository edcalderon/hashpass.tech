import type { AttendingEventData, AttendingLocale } from '../app/attending/types/attending.types';

function parseEventDate(value: string | null): Date | null {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function formatAttendingEventDate(
  event: Pick<AttendingEventData, 'startDate' | 'endDate' | 'dateFallback'>,
  locale: AttendingLocale,
): string {
  const start = parseEventDate(event.startDate);
  if (!start) return event.dateFallback || '';

  const formatter = new Intl.DateTimeFormat(locale === 'es' ? 'es-CO' : locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const end = parseEventDate(event.endDate);
  if (!end || start.getTime() === end.getTime()) return formatter.format(start);

  const startParts = formatter.formatToParts(start);
  const endParts = formatter.formatToParts(end);
  const part = (parts: Intl.DateTimeFormatPart[], type: string) => parts.find((item) => item.type === type)?.value || '';
  const startYear = part(startParts, 'year');
  const endYear = part(endParts, 'year');
  const startMonth = part(startParts, 'month');
  const endMonth = part(endParts, 'month');
  const startDay = part(startParts, 'day');
  const endDay = part(endParts, 'day');

  if (startYear === endYear && startMonth === endMonth) {
    if (locale === 'en') return `${startMonth} ${startDay}–${endDay}, ${startYear}`;
    if (locale === 'ko') return `${startYear} ${startMonth} ${startDay}–${endDay}`;
    if (locale === 'de' || locale === 'et') return `${startDay}.–${endDay}. ${startMonth} ${startYear}`;
    return `${startDay}–${endDay} ${startMonth} ${startYear}`;
  }

  return `${formatter.format(start)} – ${formatter.format(end)}`;
}
