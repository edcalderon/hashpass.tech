import type { EventContinent } from "@hashpass/types";

export type ExplorerLayoutMode = "list" | "grid" | "rail";

export const EXPLORER_HERO_LAYOUT = {
  height: 360,
  contentTopInset: 28,
  contentBottomInset: 58,
  progressBottomInset: 18,
} as const;

// Vertical list pages intentionally stay compact so the catalogue, pass
// wallet, and quick access remain reachable without a long mobile scroll.
export const EXPLORER_EVENTS_PER_PAGE = 3;

// The local catalogue resolves synchronously today. Keep the pending state
// perceptible so a tap always confirms that the event list was refreshed.
export const EXPLORER_RELOAD_FEEDBACK_MINIMUM_MS = 350;

export const getExplorerReloadFeedbackDelay = (
  startedAt: number,
  completedAt: number = Date.now(),
): number =>
  Math.max(0, EXPLORER_RELOAD_FEEDBACK_MINIMUM_MS - (completedAt - startedAt));

// Floating controls need enough room above Android's three-button navigation
// even when a device reports a zero bottom inset. Every Explorer action that
// is pinned to the lower-right corner can use this instead of guessing at the
// system navigation height.
export const getExplorerFloatingBottomInset = (safeAreaBottom = 0): number =>
  Math.max(safeAreaBottom + 16, 40);

/** Sticky content needs an opaque canvas so cards never show through the toolbar. */
export const getExplorerToolbarBackgroundColor = (colors: {
  background: { default: string };
}): string => colors.background.default;

export const resolveExplorerIconName = (name: string) => {
  const aliases = {
    search: "search",
    tune: "filter",
    "filter-list": "filter",
    view_agenda: "list",
    apps: "grid",
    view_carousel: "rail",
    "unfold-more": "sort",
    bookmark: "bookmark",
    "bookmark-border": "bookmark",
    "bookmark-added": "bookmark-filled",
    "search-off": "search-off",
    "arrow-upward": "arrow-up",
    "arrow-back": "arrow-left",
    "arrow-forward": "arrow-right",
    refresh: "refresh",
    event: "event",
    people: "people",
    info: "info",
    "confirmation-number": "ticket",
    schedule: "schedule",
    history: "history",
  } as const;
  return aliases[name as keyof typeof aliases] || "info";
};

export const getExplorerPageCount = (
  eventCount: number,
  pageSize: number = EXPLORER_EVENTS_PER_PAGE,
): number => Math.max(1, Math.ceil(eventCount / pageSize));

export const getExplorerPageEvents = <T>(
  events: T[],
  page: number,
  pageSize: number = EXPLORER_EVENTS_PER_PAGE,
): T[] => {
  const pageCount = getExplorerPageCount(events.length, pageSize);
  const safePage = Math.min(Math.max(page, 0), pageCount - 1);
  const start = safePage * pageSize;
  return events.slice(start, start + pageSize);
};

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
  communityEventType?:
    | "poker_room_event"
    | "community_tournament"
    | "community_event";
  continent?: EventContinent;
  /** Event-family key: BSL's hub and each of its stops share one chapter. */
  tourHubEventId?: string;
  hasPass?: boolean;
  color?: string;
  tourRole?: "hub" | "stop" | "archive" | string;
  image?: string;
  /** Silent event hero film for the discovery carousel. */
  heroVideo?: string;
  /** Static poster shown while a hero film is loading or unavailable. */
  heroPoster?: string;
  shortName?: string;
}

export interface ExplorerHeroSlide {
  id: string;
  eventId?: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  backgroundColor: string;
  route?: string;
  media?: { type: "image" | "video"; url: string };
  /** Render underneath video so a transport or decode failure stays useful. */
  fallbackImage?: string;
}

const getExplorerEventEyebrow = (event: ExplorerEvent): string => {
  switch (event.communityEventType) {
    case "poker_room_event":
      return "POKER ROOM";
    case "community_tournament":
      return "POKER TOURNAMENT";
    case "community_event":
      return "COMMUNITY EVENT";
    default:
      return event.shortName || event.series || "HASHPASS EVENT";
  }
};

/**
 * A tenant page represents exactly one configured event. Unlike the global
 * carousel, it retains that event's poster/film after the event becomes
 * historical because its archive remains the tenant's own home surface.
 */
export const getExplorerTenantHeroSlide = (
  event: ExplorerEvent,
): ExplorerHeroSlide => {
  const fallbackImage = event.heroPoster || event.image;

  return {
    id: `${event.id}-default`,
    eventId: event.id,
    eyebrow: getExplorerEventEyebrow(event),
    title: event.title,
    subtitle: event.eventDateString || event.subtitle || "Coming soon",
    backgroundColor: event.color || "#18212D",
    route: `/events/${event.id}/home`,
    media: event.heroVideo
      ? { type: "video", url: event.heroVideo }
      : fallbackImage
        ? { type: "image", url: fallbackImage }
        : undefined,
    fallbackImage,
  };
};

/**
 * The Explorer's global hero is event data, never campaign-copy data. Every
 * event may ship an optional muted hero film and an independently loadable
 * poster; without either, callers can use their neutral visual fallback.
 */
export const getExplorerHeroSlides = (
  events: ExplorerEvent[],
  now: number = Date.now(),
): ExplorerHeroSlide[] => {
  // Past events stay in the catalogue for discovery and history, but never
  // occupy the main dashboard hero's limited attention.
  const eventSlides = events
    .filter((event) => getExplorerEventStatus(event, now) !== "past")
    .map((event) => ({
        familyId: event.tourHubEventId || event.id,
        slide: getExplorerTenantHeroSlide(event),
      }));

  const partnersSlide: ExplorerHeroSlide = {
      id: "hashpass-partners-discovery",
      eyebrow: "OFFICIAL PARTNERS",
      title: "Built with the people moving the ecosystem forward.",
      subtitle: "Sponsors and community partners make every stop possible.",
      backgroundColor: "#18212D",
      media: {
        type: "video",
        url: "https://hashpass-production-event-media-952191196420-us-east-2.s3.us-east-2.amazonaws.com/events/hashpass-partners/branding/hashpass-partners-cover-v1.mp4",
      },
      fallbackImage:
        "https://hashpass-production-event-media-952191196420-us-east-2.s3.us-east-2.amazonaws.com/events/hashpass-partners/branding/hashpass-partners-cover-v1.jpg",
  };

  // Partners lead the global Explorer, then each event family remains intact
  // so a BSL hub is never split from its tour stops.
  const familySlides = Array.from(
    eventSlides.reduce((families, entry) => {
      const slides = families.get(entry.familyId) || [];
      slides.push(entry.slide);
      families.set(entry.familyId, slides);
      return families;
    }, new Map<string, ExplorerHeroSlide[]>()),
    ([, slides]) => slides,
  );

  return [partnersSlide, ...familySlides.flat()];
};

export interface ExplorerFilters {
  query?: string;
  includePast?: boolean;
  status?: "All" | "Upcoming" | "Past";
  fromDate?: string;
  toDate?: string;
  series?: string[];
  cityKey?: string;
  onlyPasses?: boolean;
  passTimeline?: "all" | "live" | "upcoming" | "past";
  passType?: "all" | "general" | "business" | "vip";
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
  now: number = Date.now(),
): ExplorerEvent[] => {
  const bookmarked = new Set(bookmarkedEventIds);

  return [...events].sort((a, b) => {
    // The default date view is a forward-looking catalogue. Archive entries
    // remain discoverable, but never take the first page ahead of live or
    // upcoming events, including when someone has bookmarked an archive.
    if (sortBy === "date") {
      const pastOrder =
        Number(getExplorerEventStatus(a, now) === "past") -
        Number(getExplorerEventStatus(b, now) === "past");
      if (pastOrder !== 0) return pastOrder;
    }

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
    (filters.passTimeline && filters.passTimeline !== "all" ? 1 : 0) +
    (filters.passType && filters.passType !== "all" ? 1 : 0) +
    (filters.sortBy && filters.sortBy !== "date" ? 1 : 0)
  );
};
