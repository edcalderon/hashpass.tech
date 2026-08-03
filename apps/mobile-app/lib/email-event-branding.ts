export interface EventEmailBranding {
  isBsl: boolean;
  logoAssetPath?: string;
  logoAlt?: string;
  eventTag?: string;
  eventUrl?: string;
}

const EVENT_LOGOS: ReadonlyArray<{ matcher: RegExp; country: string; label: string }> = [
  { matcher: /chile/i, country: 'chile', label: 'Chile' },
  { matcher: /colombia/i, country: 'colombia', label: 'Colombia' },
  { matcher: /peru/i, country: 'peru', label: 'Perú' },
];

const isBslEvent = (eventId: string) => /(^|[-_\s])bsl|^bsl|blockchain\s*summit|^(chile|colombia|peru)\d{4}$/i.test(eventId);

/**
 * Maps an event to the logo uploaded under emails/assets/logos/events. The
 * country-specific assets are transparent white marks for use directly on the
 * dark transactional-email header—never inside a white badge.
 */
export function getEventEmailBranding(eventId: string): EventEmailBranding {
  if (!isBslEvent(eventId)) return { isBsl: false };

  const normalized = eventId.toLowerCase().replace(/[^a-z0-9]/g, '');
  const event = EVENT_LOGOS.find(({ matcher }) => matcher.test(eventId));
  const country = event?.country || 'ontour';
  const label = event?.label ? `BSL ${event.label}` : 'Blockchain Summit LATAM';

  return {
    isBsl: true,
    logoAssetPath: `logos/events/bsl/${country}/logo.png`,
    logoAlt: label,
    eventTag: `#${normalized.startsWith('bsl') ? normalized : `bsl${normalized}`}`,
    eventUrl: 'https://blockchainsummit.la',
  };
}
