export interface Speaker {
  id: string;
  name: string;
  title: string;
  company: string;
  bio?: string;
  image?: string;
  social?: {
    linkedin?: string;
    twitter?: string;
  };
}

export interface AgendaItem {
  id: string;
  time: string;
  title: string;
  description?: string;
  speakers?: string[];
  type: "keynote" | "panel" | "workshop" | "break" | "meal" | "registration";
  location?: string;
  // Explicit day number ('1' | '2' | '3', see app/events/[eventSlug]/agenda.tsx)
  // for multi-day events. Without it, the agenda screen falls back to
  // positionally slicing the flat item list into groups of 4 to guess at
  // days, which silently misplaces most sessions once an event has more
  // than a handful of items.
  day?: string;
}

export interface QuickAccessItem {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  route: string;
}

export type EventTourRole = "hub" | "stop" | "archive";

export type EventContinent =
  | "Africa"
  | "Asia"
  | "Europe"
  | "North America"
  | "South America"
  | "Oceania"
  | "Antarctica";

export interface EventGeo {
  country: string;
  continent: EventContinent;
}

export interface EventTourMeta {
  hubEventId?: string;
  role?: EventTourRole;
  stopOrder?: number;
  city?: string;
  country?: string;
  venue?: string;
  summary?: string;
}

export interface EventConfig {
  id: string;
  name: string;
  domain: string;
  features: string[];
  // UI display fields
  title: string;
  subtitle: string;
  image: string;
  color: string;
  // Event dates for countdown and display
  eventStartDate?: string; // ISO date string for countdown
  eventEndDate?: string; // ISO date string for event end
  eventDateString?: string; // Formatted date string for display
  /** Canonical geographic metadata used by cross-event discovery surfaces. */
  geo?: EventGeo;
  /** Discovery series used by Explorer filters, e.g. Summit or Meetup. */
  series?: string;
  branding: {
    primaryColor: string;
    secondaryColor?: string;
    logo: string;
    favicon?: string;
    /** Optional organizer-managed short badge, e.g. #BSL2026. */
    badge?: string;
  };
  api: {
    basePath: string;
    endpoints: Record<string, string>;
  };
  routes: {
    home: string;
    speakers: string;
    bookings: string;
    admin?: string;
  };
  database?: {
    schema: string;
    tables: Record<string, string>;
  };
  speakers?: Speaker[];
  agenda?: AgendaItem[];
  // Per-day theme titles as actually published for this event (e.g. the
  // event's own blockchainsummit.la/{eventId}/ page), keyed by day number
  // ('1'/'2'/'3'). Falls back to generic day-theme copy when not set --
  // these are distinct per tour stop and should not be assumed shared.
  dayThemes?: Record<string, { es: string; en: string }>;
  quickAccessItems?: QuickAccessItem[];
  eventType?: "hashpass" | "whitelabel";
  tour?: EventTourMeta;
  website?: string; // Event website URL for footer links
  /** Ingestion/community metadata; conference-only surfaces are feature-gated. */
  sourceId?: string;
  organizerName?: string;
  communityEventType?: "poker_room_event" | "community_tournament" | "community_event";
  recurrenceLabel?: string;
  cta?: { label: string; url: string };
  networkingEnabled?: boolean;
  checkinEnabled?: boolean;
  /**
   * Marks an event as a demo/proof-of-concept deployment for a prospective
   * client whose deal isn't signed yet (e.g. shown on a demo-* subdomain).
   * Purely a display/schema flag today -- not wired to feature gating.
   */
  isDemo?: boolean;
}
