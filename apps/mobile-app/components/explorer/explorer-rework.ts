import type { EventContinent } from "@hashpass/types";

export type ExplorerLayoutMode = "list" | "grid" | "rail";

export const EXPLORER_HERO_LAYOUT = {
  height: 360,
  contentTopInset: 28,
  contentBottomInset: 58,
  progressBottomInset: 18,
} as const;

export interface ExplorerHeroActionTarget {
  route: string;
  eventId?: string;
}

export const getEventRoomTarget = (eventId: string) => ({
  pathname: "/dashboard/event-chat",
  params: { eventId },
});

export const getExplorerHeroActionTarget = (
  action: string,
): ExplorerHeroActionTarget | null => {
  switch (action) {
    case "Get your pass":
      return {
        route: "/(shared)/dashboard/explore?eventId=colombia2026",
        eventId: "colombia2026",
      };
    case "Explore the tour":
      return { route: "/(shared)/dashboard/explore?tour=bsl-on-tour" };
    default:
      return null;
  }
};

export interface ExplorerEvent {
  id: string;
  title: string;
  subtitle?: string;
  eventDateString?: string;
  eventStartDate?: string;
  eventEndDate?: string;
  country?: string;
  city?: string;
  cityKey?: string;
  series?: string;
  continent?: EventContinent;
  hasPass?: boolean;
  color?: string;
  tourRole?: "hub" | "stop" | "archive" | string;
  image?: string;
}

export interface ExplorerFilters {
  query?: string;
  includePast?: boolean;
  status?: "All" | "Upcoming" | "Past";
  fromDate?: string;
  toDate?: string;
  series?: string[];
  cityKey?: string;
  onlyPasses?: boolean;
  sortBy?: "date" | "name";
}

export interface ExplorerLayout {
  columns: number;
  coverSize: number;
  horizontal: boolean;
  cardWidth: number;
  gap: number;
}

const normalize = (value?: string): string =>
  (value || "").trim().toLocaleLowerCase();

export type ExplorerEventStatus = "upcoming" | "live" | "past";

export const getExplorerEventStatus = (
  event: Pick<ExplorerEvent, "eventStartDate" | "eventEndDate" | "tourRole">,
  now: number = Date.now(),
): ExplorerEventStatus => {
  if (event.tourRole === "archive") return "past";

  const end = event.eventEndDate ? Date.parse(event.eventEndDate) : NaN;
  const start = event.eventStartDate ? Date.parse(event.eventStartDate) : NaN;
  if (Number.isFinite(end) && end < now) return "past";
  if (Number.isFinite(start) && start <= now) return "live";
  return "upcoming";
};

export const filterExplorerEvents = (
  events: ExplorerEvent[],
  filters: ExplorerFilters,
  now: number = Date.now(),
): ExplorerEvent[] => {
  const query = normalize(filters.query);

  return events.filter((event) => {
    const status = getExplorerEventStatus(event, now);
    const requestedStatus =
      filters.status || (filters.includePast === false ? "Upcoming" : "All");
    if (requestedStatus === "Upcoming" && status === "past") return false;
    if (requestedStatus === "Past" && status !== "past") return false;

    const start = event.eventStartDate ? Date.parse(event.eventStartDate) : NaN;
    const from = filters.fromDate ? Date.parse(filters.fromDate) : NaN;
    const to = filters.toDate ? Date.parse(filters.toDate) : NaN;
    if (Number.isFinite(from) && (!Number.isFinite(start) || start < from)) {
      return false;
    }
    if (Number.isFinite(to) && (!Number.isFinite(start) || start > to)) {
      return false;
    }
    if (
      filters.series?.length &&
      !filters.series.includes(event.series || "")
    ) {
      return false;
    }
    if (
      filters.cityKey &&
      filters.cityKey !== "all" &&
      event.cityKey !== filters.cityKey
    ) {
      return false;
    }
    if (filters.onlyPasses && event.hasPass !== true) return false;
    if (!query) return true;

    return [
      event.title,
      event.subtitle,
      event.eventDateString,
      event.city,
      event.series,
    ]
      .map(normalize)
      .some((value) => value.includes(query));
  });
};

export const sortExplorerEvents = (
  events: ExplorerEvent[],
  bookmarkedEventIds: string[] = [],
  sortBy: "date" | "name" = "date",
): ExplorerEvent[] => {
  const bookmarked = new Set(bookmarkedEventIds);

  return [...events].sort((a, b) => {
    const bookmarkOrder =
      Number(bookmarked.has(b.id)) - Number(bookmarked.has(a.id));
    if (bookmarkOrder !== 0) return bookmarkOrder;

    if (sortBy === "name") return a.title.localeCompare(b.title);
    const aStart = a.eventStartDate ? Date.parse(a.eventStartDate) : NaN;
    const bStart = b.eventStartDate ? Date.parse(b.eventStartDate) : NaN;
    const aSortable = Number.isFinite(aStart)
      ? aStart
      : Number.MAX_SAFE_INTEGER;
    const bSortable = Number.isFinite(bStart)
      ? bStart
      : Number.MAX_SAFE_INTEGER;
    if (aSortable !== bSortable) return aSortable - bSortable;
    return a.title.localeCompare(b.title);
  });
};

const AMERICAN_CONTINENTS = new Set<EventContinent>([
  "North America",
  "South America",
]);

export const getExplorerScopeLabel = (events: ExplorerEvent[]): string => {
  const continents = new Set(
    events
      .map((event) => event.continent)
      .filter((continent): continent is EventContinent => Boolean(continent)),
  );

  if (continents.size === 1 && continents.has("South America")) {
    return "Latam";
  }

  if (
    continents.size > 0 &&
    Array.from(continents).every((continent) =>
      AMERICAN_CONTINENTS.has(continent),
    )
  ) {
    return "America";
  }

  return "the world";
};

export const getExplorerLayout = (mode: ExplorerLayoutMode): ExplorerLayout => {
  switch (mode) {
    case "grid":
      return {
        columns: 3,
        coverSize: 126,
        horizontal: false,
        cardWidth: 0,
        gap: 9,
      };
    case "rail":
      return {
        columns: 1,
        coverSize: 132,
        horizontal: true,
        cardWidth: 250,
        gap: 14,
      };
    case "list":
    default:
      return {
        columns: 1,
        coverSize: 132,
        horizontal: false,
        cardWidth: 0,
        gap: 12,
      };
  }
};

export const getActiveFilterCount = (filters: ExplorerFilters): number => {
  return (
    (normalize(filters.query) ? 1 : 0) +
    (filters.status && filters.status !== "All"
      ? 1
      : filters.includePast === false
        ? 1
        : 0) +
    (filters.fromDate ? 1 : 0) +
    (filters.toDate ? 1 : 0) +
    (filters.series?.length ? 1 : 0) +
    (filters.cityKey && filters.cityKey !== "all" ? 1 : 0) +
    (filters.onlyPasses ? 1 : 0) +
    (filters.sortBy && filters.sortBy !== "date" ? 1 : 0)
  );
};
