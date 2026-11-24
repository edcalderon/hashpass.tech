import type { AttendingEventLinkOrigin } from '../app/attending/types/attending.types';

const ATTENDING_LANDING_ORIGIN = 'https://attending.hashpass.tech';
const BSL_ATTENDING_ORIGIN = 'https://bsl.hashpass.tech';
const GENERIC_ATTENDING_ORIGIN = 'https://hashpass.club';

export function getAttendingLandingBrandUrl(): string {
  if (process.env.NODE_ENV === 'development') return '/';
  return process.env.NEXT_PUBLIC_ATTENDING_SITE_HOME_URL?.trim() || getAttendingLandingUrl();
}

export function getAttendingLandingUrl(): string {
  if (process.env.NODE_ENV === 'development') return '/attending/';
  if (process.env.NEXT_PUBLIC_ATTENDING_SITE_EVENT_SLUG?.trim().toLowerCase() === 'bsl') {
    return `${BSL_ATTENDING_ORIGIN}/attending/`;
  }
  return `${ATTENDING_LANDING_ORIGIN}/`;
}

export function getGenericAttendingUrl(): string {
  return `${GENERIC_ATTENDING_ORIGIN}/attendings/`;
}

export function getGenericAttendingHref(): string {
  if (process.env.NODE_ENV === 'development') return '/attendings/custom/';
  return `${GENERIC_ATTENDING_ORIGIN}/attendings/custom/`;
}

export function getGenericAttendingLandingHref(): string {
  if (process.env.NODE_ENV === 'development') return '/attendings/';
  return getGenericAttendingUrl();
}

export function getAttendingEventSubdomain(eventSlug: string): string {
  return eventSlug.trim().toLowerCase();
}

export function getAttendingEventUrl(eventSlug: string): string {
  const subdomain = getAttendingEventSubdomain(eventSlug);
  // bsl.hashpass.tech already serves the BSL event app at `/`; keep that
  // homepage intact and host its artwork builder in the app's route space.
  if (subdomain === 'bsl') return `https://${subdomain}.hashpass.tech/attending/bsl/`;
  // The public CBWeek tenant keeps the year-qualified hostname. Its short
  // campaign URL remains an alias and its artwork builder lives below the app.
  if (subdomain === 'cbweek') return 'https://cbweek2026.hashpass.tech/attending/cbweek/';
  return `https://${subdomain}.hashpass.tech/`;
}

/**
 * The artwork API publishes public links on an event tenant. Keep that URL
 * separate from a mirrored Club event page such as /attendings/bsl/.
 */
export function getAttendingArtworkPublishEventUrl(eventSlug: string, customEvent = false): string {
  return customEvent ? getGenericAttendingUrl() : getAttendingEventUrl(eventSlug);
}

export function getAttendingClubEventUrl(eventSlug: string): string {
  return `${GENERIC_ATTENDING_ORIGIN}/attendings/${getAttendingEventSubdomain(eventSlug)}/`;
}

export function getAttendingEventHref(
  eventSlug: string,
  linkOrigin: AttendingEventLinkOrigin = 'tenant',
): string {
  const subdomain = getAttendingEventSubdomain(eventSlug);
  if (linkOrigin === 'club' && (subdomain === 'bsl' || subdomain === 'cbweek')) {
    return `/attendings/${subdomain}`;
  }
  if (process.env.NODE_ENV === 'development') return `/attending/${subdomain}/`;
  return getAttendingEventUrl(subdomain);
}
