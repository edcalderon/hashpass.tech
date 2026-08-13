import { EVENTS } from '../config/events';
import type { PassInfo, PassType } from './pass-system';

// Where a pass sits relative to today. Derived from the event's own configured
// start/end dates, NOT from pass.status -- a cancelled pass for next month is
// still an upcoming-event pass, it just isn't usable. Usability is carried
// separately by `isArchived` so the card can dim it without lying about when
// the event happens.
export type PassTimeline = 'live' | 'upcoming' | 'past';

export type PassTimelineFilter = 'all' | PassTimeline;
export type PassTypeFilter = 'all' | PassType;

export interface WalletPass extends PassInfo {
  // Stable list key. pass_id is unique per row, but the legacy counts-only
  // fallback (getUserPassInfoFromCounts) hands back the literal 'unknown', so
  // fall back to the event id to keep keys distinct in a mixed list.
  id: string;
  eventId?: string;
  eventName: string;
  eventDateLabel: string;
  eventLocation: string;
  accentColor: string;
  timeline: PassTimeline;
  startsAt: number | null;
  endsAt: number | null;
  isArchived: boolean;
  // Precomputed lowercase haystack so filtering never re-derives it per
  // keystroke.
  searchText: string;
}

export interface WalletFilters {
  query?: string;
  timeline?: PassTimelineFilter;
  passType?: PassTypeFilter;
}

// How many cards of the deck are drawn at once. The rest exist in the order
// but stay unmounted: past the fourth card the offset stack is visually
// indistinguishable, and mounting every pass would put several full ticket
// layouts on screen for no gain.
export const MAX_VISIBLE_STACK = 4;

export const normalizePassNumber = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);

const PASS_TYPE_ACCENTS: Record<string, string> = {
  general: '#34A853',
  business: '#007AFF',
  vip: '#FF9500',
};

const parseDate = (value: unknown): number | null => {
  if (typeof value !== 'string' || !value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const getPassTypeAccent = (passType?: string | null): string =>
  PASS_TYPE_ACCENTS[passType ?? ''] ?? '#8E8E93';

const classifyTimeline = (
  startsAt: number | null,
  endsAt: number | null,
  now: number
): PassTimeline => {
  // An event with no configured dates can't be placed on the calendar. Treat
  // it as upcoming rather than past so a live pass never gets filed into the
  // history section by accident.
  if (endsAt === null) return 'upcoming';
  if (endsAt < now) return 'past';
  if (startsAt !== null && startsAt <= now) return 'live';
  return 'upcoming';
};

const resolveEventMeta = (eventId?: string) => {
  const config = eventId ? (EVENTS as Record<string, any>)[eventId] : undefined;
  if (!config) {
    return {
      name: eventId ?? 'Event',
      dateLabel: '',
      location: '',
      startsAt: null as number | null,
      endsAt: null as number | null,
    };
  }

  const city = config.tour?.city as string | undefined;
  const country = config.tour?.country as string | undefined;
  const location = city && country ? `${city}, ${country}` : city || country || '';

  return {
    name: (config.name || config.title || eventId) as string,
    dateLabel: (config.eventDateString || config.subtitle || '') as string,
    location: location || ((config.subtitle || '') as string),
    startsAt: parseDate(config.eventStartDate),
    endsAt: parseDate(config.eventEndDate),
  };
};

/**
 * Decorate raw passes with the event metadata and calendar position the
 * wallet UI needs, then order them the way a person reads a wallet: what's
 * happening now, then what's coming, then history.
 */
export const buildWalletPasses = (
  passes: PassInfo[],
  now: number = Date.now()
): WalletPass[] => {
  const decorated = passes.map((pass) => {
    const meta = resolveEventMeta(pass.event_id);
    const timeline = classifyTimeline(meta.startsAt, meta.endsAt, now);
    const typeLabel = pass.pass_type ?? '';

    return {
      ...pass,
      id: pass.pass_id && pass.pass_id !== 'unknown' ? pass.pass_id : `${pass.event_id ?? 'event'}-${typeLabel}`,
      eventId: pass.event_id,
      eventName: meta.name,
      eventDateLabel: meta.dateLabel,
      eventLocation: meta.location,
      accentColor: getPassTypeAccent(pass.pass_type),
      timeline,
      startsAt: meta.startsAt,
      endsAt: meta.endsAt,
      isArchived: pass.status !== 'active',
      searchText: [
        meta.name,
        meta.dateLabel,
        meta.location,
        typeLabel,
        pass.status ?? '',
        pass.pass_number ?? '',
      ]
        .join(' ')
        .toLowerCase(),
    } satisfies WalletPass;
  });

  return sortWalletPasses(decorated);
};

const TIMELINE_ORDER: Record<PassTimeline, number> = { live: 0, upcoming: 1, past: 2 };

export const sortWalletPasses = (passes: WalletPass[]): WalletPass[] =>
  [...passes].sort((a, b) => {
    const groupDelta = TIMELINE_ORDER[a.timeline] - TIMELINE_ORDER[b.timeline];
    if (groupDelta !== 0) return groupDelta;

    // Within upcoming/live: soonest first. Within past: most recent first.
    if (a.timeline === 'past') {
      return (b.endsAt ?? 0) - (a.endsAt ?? 0);
    }

    const aStart = a.startsAt ?? Number.MAX_SAFE_INTEGER;
    const bStart = b.startsAt ?? Number.MAX_SAFE_INTEGER;
    if (aStart !== bStart) return aStart - bStart;
    return a.eventName.localeCompare(b.eventName);
  });

export const filterWalletPasses = (
  passes: WalletPass[],
  { query = '', timeline = 'all', passType = 'all' }: WalletFilters = {}
): WalletPass[] => {
  const normalizedQuery = query.trim().toLowerCase();

  return passes.filter((pass) => {
    if (timeline !== 'all' && pass.timeline !== timeline) return false;
    if (passType !== 'all' && pass.pass_type !== passType) return false;
    if (normalizedQuery && !pass.searchText.includes(normalizedQuery)) return false;
    return true;
  });
};

export interface WalletCounts {
  total: number;
  live: number;
  upcoming: number;
  past: number;
}

export const countWalletPasses = (passes: WalletPass[]): WalletCounts =>
  passes.reduce<WalletCounts>(
    (counts, pass) => {
      counts[pass.timeline] += 1;
      return counts;
    },
    { total: passes.length, live: 0, upcoming: 0, past: 0 }
  );
