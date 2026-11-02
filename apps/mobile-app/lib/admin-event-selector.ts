import type { EventConfig } from "@hashpass/types";
import type {
  AdminEventFilter,
  AdminEventOption,
} from "../types/AdminEventSelector.types";

const timestamp = (value?: string): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isConfigUpcoming = (event: EventConfig, now: number): boolean => {
  const end = timestamp(event.eventEndDate);
  if (end !== null) return end >= now;

  const start = timestamp(event.eventStartDate);
  return start !== null && start >= now;
};

const normalizeSearch = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();

export const getEventAdminLabel = (
  eventId: string,
  events: Record<string, EventConfig>,
): string => {
  const event = events[eventId];
  if (!event) return eventId;

  const series = event.series?.trim();
  const title = (event.title || event.name || eventId).trim();
  return series && !title.toLowerCase().includes(series.toLowerCase())
    ? `${series} · ${title}`
    : title;
};

export const createAdminEventOptions = (
  events: Record<string, EventConfig>,
  now = Date.now(),
): AdminEventOption[] => {
  const entries = Object.entries(events);
  const upcomingChildren = new Map<string, EventConfig[]>();

  for (const [, event] of entries) {
    const hubEventId = event.tour?.hubEventId;
    if (!hubEventId || !isConfigUpcoming(event, now)) continue;
    const children = upcomingChildren.get(hubEventId) ?? [];
    children.push(event);
    upcomingChildren.set(hubEventId, children);
  }

  return entries.map(([eventId, event]) => {
    const childStops = upcomingChildren.get(eventId) ?? [];
    const childStartDates = childStops
      .map((child) => child.eventStartDate)
      .filter((date): date is string => Boolean(date))
      .sort(
        (left, right) =>
          (timestamp(left) ?? Infinity) - (timestamp(right) ?? Infinity),
      );
    const startDate = event.eventStartDate ?? childStartDates[0];
    const location = [event.tour?.city, event.tour?.country, event.geo?.country]
      .filter(Boolean)
      .join(" · ");
    const detail =
      event.eventDateString?.trim() || location || event.subtitle || "";
    const label = getEventAdminLabel(eventId, events);
    const searchableText = [
      eventId,
      label,
      event.name,
      event.title,
      event.subtitle,
      event.eventDateString,
      event.series,
      event.tour?.city,
      event.tour?.country,
      event.geo?.city,
      event.geo?.country,
    ]
      .filter(Boolean)
      .join(" ");

    return {
      eventId,
      label,
      detail,
      searchText: normalizeSearch(searchableText),
      startDate,
      endDate: event.eventEndDate,
      isSeriesHub: event.tour?.role === "hub",
      hasUpcomingChildren: childStops.length > 0,
    };
  });
};

export const isAdminEventUpcoming = (
  event: AdminEventOption,
  now = Date.now(),
): boolean => {
  const end = timestamp(event.endDate);
  if (end !== null) return end >= now;

  const start = timestamp(event.startDate);
  return (start !== null && start >= now) || event.hasUpcomingChildren;
};

const isAdminEventPast = (event: AdminEventOption, now: number): boolean => {
  const end = timestamp(event.endDate);
  if (end !== null) return end < now;

  const start = timestamp(event.startDate);
  return start !== null && start < now && !event.hasUpcomingChildren;
};

const eventSortTimestamp = (event: AdminEventOption): number =>
  timestamp(event.startDate) ??
  timestamp(event.endDate) ??
  Number.MAX_SAFE_INTEGER;

export const filterAdminEventOptions = (
  events: AdminEventOption[],
  filter: AdminEventFilter,
  query = "",
  now = Date.now(),
): AdminEventOption[] => {
  const normalizedQuery = normalizeSearch(query.trim());
  const filtered = events.filter((event) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "upcoming" && isAdminEventUpcoming(event, now)) ||
      (filter === "past" && isAdminEventPast(event, now));
    return (
      matchesFilter &&
      (!normalizedQuery || event.searchText.includes(normalizedQuery))
    );
  });

  return filtered.sort((left, right) => {
    if (filter === "past")
      return eventSortTimestamp(right) - eventSortTimestamp(left);
    if (filter === "upcoming")
      return eventSortTimestamp(left) - eventSortTimestamp(right);

    const rank = (event: AdminEventOption) =>
      isAdminEventUpcoming(event, now)
        ? 0
        : isAdminEventPast(event, now)
          ? 2
          : 1;
    return (
      rank(left) - rank(right) ||
      eventSortTimestamp(left) - eventSortTimestamp(right)
    );
  });
};

export const getPreferredAdminEventId = (
  currentEventId: string | null | undefined,
  events: AdminEventOption[],
  now = Date.now(),
): string | null => {
  const currentEvent = events.find((event) => event.eventId === currentEventId);
  if (currentEvent && isAdminEventUpcoming(currentEvent, now))
    return currentEvent.eventId;

  const upcoming = filterAdminEventOptions(events, "upcoming", "", now);
  return (
    upcoming.find((event) => !event.isSeriesHub)?.eventId ??
    upcoming[0]?.eventId ??
    currentEvent?.eventId ??
    events[0]?.eventId ??
    null
  );
};
