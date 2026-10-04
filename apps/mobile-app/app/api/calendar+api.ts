import { EVENTS } from '@hashpass/config';
import type { AgendaItem, EventConfig } from '@hashpass/types';
import {
  serializeCalendarFeed,
  type CalendarFeedItem,
} from '../../lib/calendar-subscription';

const DEFAULT_SESSION_MINUTES = 45;

const eventPageUrl = (eventId: string): string =>
  `https://hashpass.tech/events/${encodeURIComponent(eventId)}/agenda`;

const validDate = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const buildPublicCalendarItems = (
  events: Record<string, EventConfig> = EVENTS,
): CalendarFeedItem[] => {
  const items: CalendarFeedItem[] = [];

  for (const [eventId, event] of Object.entries(events)) {
    if (eventId === 'default' || !Array.isArray(event.agenda)) continue;

    const agenda = event.agenda
      .map((item: AgendaItem) => ({ item, start: validDate(item.time) }))
      .filter(
        (entry): entry is { item: AgendaItem; start: Date } =>
          entry.start !== null,
      )
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    agenda.forEach(({ item, start }, index) => {
      const explicitEnd = validDate((item as AgendaItem & { end_time?: string }).end_time);
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
