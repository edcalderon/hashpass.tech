import type { EventInfo } from './event-detector';
export type PublicEventStatus = 'live' | 'upcoming' | 'undated' | 'past';
export type PublicEventFilters = { query?: string; status?: 'all' | 'upcoming' | 'past'; series?: string; continent?: string };
const time = (value?: string) => value ? Date.parse(value) : NaN;
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function publicEventStatus(event: EventInfo, now = Date.now()): PublicEventStatus {
  if (event.tourRole === 'archive') return 'past';
  const start = time(event.eventStartDate); const end = time(event.eventEndDate);
  if (Number.isFinite(end) && end < now) return 'past';
  if (!Number.isFinite(start)) return 'undated';
  if (start > now) return 'upcoming';
  // A start-only listing expires after one day; it must not stay "live" forever.
  return now <= (Number.isFinite(end) ? end : start + 86_400_000) ? 'live' : 'past';
}
export function filterPublicEvents(events: EventInfo[], filters: PublicEventFilters = {}, now = Date.now()): EventInfo[] {
  const words = normalize(filters.query || '').split(/\s+/).filter(Boolean);
  const order: Record<PublicEventStatus, number> = { live: 0, upcoming: 1, undated: 2, past: 3 };
  return events.filter(event => {
    if (['main', 'default'].includes(event.id) || event.eventType === 'hashpass' || event.available === false) return false;
    const status = publicEventStatus(event, now);
    if (filters.status === 'upcoming' && status !== 'upcoming' && status !== 'live') return false;
    if (filters.status === 'past' && status !== 'past') return false;
    if (filters.series && filters.series !== event.series) return false;
    if (filters.continent && filters.continent !== event.geo?.continent) return false;
    const haystack = normalize([event.title, event.subtitle, event.eventDateString, event.series, event.geo?.country, event.geo?.continent].filter(Boolean).join(' '));
    return words.every(word => haystack.includes(word));
  }).sort((a, b) => {
    const aStatus = publicEventStatus(a, now); const bStatus = publicEventStatus(b, now);
    if (aStatus !== bStatus) return order[aStatus] - order[bStatus];
    const aTime = time(a.eventStartDate); const bTime = time(b.eventStartDate);
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aStatus === 'past' ? bTime - aTime : aTime - bTime;
    return a.title.localeCompare(b.title);
  });
}
