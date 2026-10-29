import { getAttendingLandingUrl } from './attending-url';

const CLUB_ORIGIN = 'https://hashpass.club';
const CLUB_HOSTNAMES = new Set(['hashpass.club', 'www.hashpass.club']);

/**
 * Build links to Club-owned routes from the event and attending static sites.
 * Those sites reuse the Club footer, but their domains do not serve Club pages
 * such as /about or /documentation. Keep local development same-origin.
 */
export function getClubRouteHref(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || process.env.NODE_ENV !== 'production') {
    return path;
  }

  const configuredHome = process.env.NEXT_PUBLIC_ATTENDING_SITE_HOME_URL?.trim();
  const landingUrl = configuredHome || getAttendingLandingUrl();

  try {
    const hostname = new URL(landingUrl).hostname.toLowerCase();
    return CLUB_HOSTNAMES.has(hostname) ? path : `${CLUB_ORIGIN}${path}`;
  } catch {
    // A malformed optional deployment URL should not produce a broken link.
    return `${CLUB_ORIGIN}${path}`;
  }
}

/** Club pages stay in the same tab; other absolute web links open separately. */
export function isExternalClubFooterHref(href: string): boolean {
  if (!/^https?:\/\//i.test(href)) return false;

  try {
    return !CLUB_HOSTNAMES.has(new URL(href).hostname.toLowerCase());
  } catch {
    return false;
  }
}
