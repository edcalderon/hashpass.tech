import { EVENTS } from '@hashpass/config';
import type { AgendaItem, EventConfig } from '@hashpass/types';
import {
  serializeCalendarFeed,
  type CalendarFeedItem,
} from '../../lib/calendar-subscription';
import { getEventTzOffset, parseAgendaTime } from '../../lib/event-time';

const DEFAULT_SESSION_MINUTES = 45;
const TIME_RANGE = /^\s*\d{1,2}:\d{2}\s*-\s*(\d{1,2}:\d{2})\s*$/;

const eventPageUrl = (eventId: string): string =>
  `https://hashpass.tech/events/${encodeURIComponent(eventId)}/agenda`;

const isValidDate = (value: Date): boolean => !Number.isNaN(value.getTime());

const agendaEndTime = (
  item: AgendaItem,
  eventStartDate: string | undefined,
  eventTzOffset: string,
  start: Date,
): Date | null => {
  const endTime = (item as AgendaItem & { end_time?: string }).end_time;
  const rangeEnd = item.time.match(TIME_RANGE)?.[1];
  const value = endTime || rangeEnd;
  if (!value) return null;

  const end = parseAgendaTime(value, eventStartDate, item.day, eventTzOffset);
  if (!isValidDate(end)) return null;
  return end > start ? end : new Date(end.getTime() + 24 * 60 * 60 * 1000);
};

export const buildPublicCalendarItems = (
  events: Record<string, EventConfig> = EVENTS,
): CalendarFeedItem[] => {
  const items: CalendarFeedItem[] = [];

  for (const [eventId, event] of Object.entries(events)) {
    if (eventId === 'default' || !Array.isArray(event.agenda)) continue;

    const eventTzOffset = getEventTzOffset(event.eventStartDate);
    const agenda = event.agenda
      .map((item: AgendaItem) => ({
        item,
        start: parseAgendaTime(item.time, event.eventStartDate, item.day, eventTzOffset),
      }))
      .filter(
        (entry): entry is { item: AgendaItem; start: Date } =>
          isValidDate(entry.start),
      )
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    agenda.forEach(({ item, start }, index) => {
      const explicitEnd = agendaEndTime(item, event.eventStartDate, eventTzOffset, start);
      const nextStart = agenda[index + 1]?.start;
      const fallbackEnd = new Date(
        start.getTime() + DEFAULT_SESSION_MINUTES * 60 * 1000,
      );
      const nextSessionIsNear =
        nextStart && nextStart.getTime() - start.getTime() <= 3 * 60 * 60 * 1000;
      const end =
        explicitEnd && explicitEnd > start
          ? explicitEnd
          : nextStart && nextStart > start && nextSessionIsNear
            ? nextStart
            : fallbackEnd;

      items.push({
        uid: `${eventId}-${item.id}@hashpass.tech`,
        title: `${event.name}: ${item.title}`,
        description: item.description,
        location: item.location,
        start,
        end,
        url: eventPageUrl(eventId),
      });
    });
  }

  return items;
};

export async function GET() {
  const calendar = serializeCalendarFeed(buildPublicCalendarItems());
  return new Response(calendar, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
      'Content-Disposition': 'inline; filename="hashpass-events.ics"',
      'Content-Type': 'text/calendar; charset=utf-8',
    },
  });
}
