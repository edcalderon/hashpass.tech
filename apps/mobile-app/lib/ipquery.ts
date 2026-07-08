/**
 * ipquery.io geolocation utility.
 * Docs: https://ipquery.io/#docs
 *
 * Used for:
 * - Cookie consent EU jurisdiction detection (CookieConsentBanner)
 * - Country pre-fill at user registration
 *
 * Free tier: no API key required. Call fetchIPLocation() for the
 * requesting client's own IP. Cache the result in the module so
 * subsequent callers within the same session don't pay a network round-trip.
 */

export interface IPLocation {
  ip: string;
  country: string;
  country_code: string;
  city: string;
  state: string;
  timezone: string;
  latitude: number;
  longitude: number;
}

// EU/EEA/UK/CH — jurisdictions where GDPR + ePrivacy consent is required
export const GDPR_COUNTRY_CODES = new Set([
  // EU 27
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE',
  // EEA (non-EU)
  'IS', 'LI', 'NO',
  // UK GDPR
  'GB',
  // Switzerland — Federal Act on Data Protection mirrors GDPR
  'CH',
]);

export function isGDPRCountry(code: string): boolean {
  return GDPR_COUNTRY_CODES.has(code.toUpperCase());
}

// Timezone fallback — used when ipquery is unreachable
const GDPR_TIMEZONES = new Set([
  'Europe/Vienna', 'Europe/Brussels', 'Europe/Sofia', 'Europe/Zagreb',
  'Europe/Nicosia', 'Europe/Prague', 'Europe/Copenhagen', 'Europe/Tallinn',
  'Europe/Helsinki', 'Europe/Paris', 'Europe/Berlin', 'Europe/Athens',
  'Europe/Budapest', 'Europe/Dublin', 'Europe/Rome', 'Europe/Riga',
  'Europe/Vilnius', 'Europe/Luxembourg', 'Europe/Malta', 'Europe/Amsterdam',
  'Europe/Warsaw', 'Europe/Lisbon', 'Europe/Bucharest', 'Europe/Bratislava',
  'Europe/Ljubljana', 'Europe/Madrid', 'Europe/Stockholm',
  'Europe/Reykjavik', 'Europe/Vaduz', 'Europe/Oslo',
  'Europe/London', 'Europe/Guernsey', 'Europe/Isle_of_Man', 'Europe/Jersey',
  'Europe/Zurich',
  'Atlantic/Canary', 'Atlantic/Madeira', 'Atlantic/Azores',
]);

function isGDPRTimezone(): boolean {
  try {
    return GDPR_TIMEZONES.has(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return false;
  }
}

// Module-level cache so multiple callers share the same request
let cached: Promise<IPLocation | null> | null = null;

export function fetchIPLocation(): Promise<IPLocation | null> {
  if (cached) return cached;

  cached = (async () => {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 3000);

      const res = await fetch('https://api.ipquery.io/', {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(tid);

      if (!res.ok) return null;
      const data = await res.json();

      return {
        ip: data.ip ?? '',
        country: data.location?.country ?? '',
        country_code: data.location?.country_code ?? '',
        city: data.location?.city ?? '',
        state: data.location?.state ?? '',
        timezone: data.location?.timezone ?? '',
        latitude: data.location?.latitude ?? 0,
        longitude: data.location?.longitude ?? 0,
      } satisfies IPLocation;
    } catch {
      return null;
    }
  })();

  return cached;
}

/** True when the current client is in a GDPR-regulated jurisdiction. */
export async function isGDPRJurisdiction(): Promise<boolean> {
  const loc = await fetchIPLocation();
  if (loc?.country_code) return isGDPRCountry(loc.country_code);
  return isGDPRTimezone();
}
