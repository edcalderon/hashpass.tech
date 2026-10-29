const ATTENDING_LANDING_ORIGIN = 'https://attending.hashpass.tech';

export function getAttendingLandingUrl(): string {
  if (process.env.NODE_ENV === 'development') return '/attending/';
  return `${ATTENDING_LANDING_ORIGIN}/attending/`;
}

export function getAttendingEventSubdomain(eventSlug: string): string {
  return eventSlug.trim().toLowerCase();
}

export function getAttendingEventUrl(eventSlug: string): string {
  const subdomain = getAttendingEventSubdomain(eventSlug);
  // bsl.hashpass.tech already serves the BSL event app at `/`; keep that
  // homepage intact and host its artwork builder in the app's route space.
  if (subdomain === 'bsl') return `https://${subdomain}.hashpass.tech/attending/bsl/`;
  return `https://${subdomain}.hashpass.tech/`;
}

export function getAttendingEventHref(eventSlug: string): string {
  const subdomain = getAttendingEventSubdomain(eventSlug);
  if (process.env.NODE_ENV === 'development') return `/attending/${subdomain}/`;
  return getAttendingEventUrl(subdomain);
}
