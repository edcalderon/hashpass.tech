import type { Metadata } from 'next';
import { EVENTS } from '@hashpass/config';
import type { EventConfig } from '@hashpass/types';
import { getAttendingEventUrl } from '../../lib/attending-url';
import type { AttendingArtworkTemplate, AttendingEventData } from './types/attending.types';

const ROUTE_EVENT_IDS: Record<string, string> = {
  // Keep the short event campaign URL pointed at the current BSL stop in Bogotá.
  bsl: 'colombia2026',
  'bsl-on-tour': 'bsl',
  cbweek: 'cbweek2026',
};

export const FEATURED_ATTENDING_EVENT_SLUGS = ['bsl', 'cbweek'] as const;

export function getAttendingLandingEventSlug() {
  const configuredSlug = process.env.NEXT_PUBLIC_ATTENDING_SITE_EVENT_SLUG?.trim().toLowerCase();
  return configuredSlug && (FEATURED_ATTENDING_EVENT_SLUGS as readonly string[]).includes(configuredSlug)
    ? configuredSlug
    : null;
}

const POWERED_BY_LOGO = '/attending/logo-full-hashpass-white-cyan.svg';

const BSL_COLOMBIA_ARTWORK_TEMPLATE: Partial<AttendingArtworkTemplate> = {
  backgroundSrc: '/attending/backgrounds/bsl-colombia-2026.png',
  accentColor: '#27D8FF',
  secondaryAccentColor: '#156BFF',
  flagColors: ['#FCD116', '#003893', '#CE1126'],
  hashtags: ['#BlockchainSummitLatam', '#BSLOnTour2026', '#BSLColombia2026'],
  xHandle: '@BlockSummitLA',
};

const ARTWORK_TEMPLATE_OVERRIDES: Record<string, Partial<AttendingArtworkTemplate>> = {
  colombia2026: BSL_COLOMBIA_ARTWORK_TEMPLATE,
};

export const ATTENDING_EVENT_SLUGS = Array.from(
  new Set([
    ...Object.keys(EVENTS).filter((id) => id !== 'bsl' && id !== 'default'),
    'bsl',
    'bsl-on-tour',
    'cbweek',
  ]),
);

function todayInBogota(): string {
  const dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const year = dateParts.find((part) => part.type === 'year')?.value || '1970';
  const month = dateParts.find((part) => part.type === 'month')?.value || '01';
  const day = dateParts.find((part) => part.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

export function getUpcomingFeaturedAttendingEvents(
  today = todayInBogota(),
): AttendingEventData[] {
  const dedicatedEventSlug = getAttendingLandingEventSlug();
  const featuredSlugs: readonly string[] = dedicatedEventSlug
    ? [dedicatedEventSlug]
    : FEATURED_ATTENDING_EVENT_SLUGS;

  return featuredSlugs.flatMap((eventSlug) => {
    const event = resolveAttendingEvent(eventSlug);
    if (!event) return [];
    const lastEventDay = (event.eventEndDate || event.eventStartDate || '').slice(0, 10);
    if (lastEventDay && lastEventDay < today) return [];
    return [makeAttendingEventData(event, eventSlug)];
  });
}

export function resolveAttendingEvent(eventSlug: string): EventConfig | null {
  const eventId = ROUTE_EVENT_IDS[eventSlug] ?? eventSlug;
  if (eventId === 'default') return null;
  return EVENTS[eventId] ?? null;
}

function getLogoSrc(event: EventConfig): string {
  const localLogos: Record<string, string> = {
    bsl: '/attending/logos/bsl-ontour-pro.svg',
    peru2026: '/attending/logos/bsl-peru-pro.svg',
    chile2026: '/attending/logos/bsl-chile-pro.svg',
    colombia2026: '/attending/logos/bsl-ontour-pro.svg',
    bsl2025: '/attending/logos/BSL-Logo-fondo-oscuro-2024.svg',
    'hash-poker': '/attending/logos/hash-poker-room-logo.webp',
  };
  const localLogo = localLogos[event.id];
  if (localLogo) return localLogo;

  const configuredLogo = event.branding?.logo || event.image;
  if (configuredLogo.startsWith('http://') || configuredLogo.startsWith('https://')) {
    return configuredLogo;
  }
  return `https://hashpass.tech${configuredLogo}`;
}

export function makeAttendingEventData(event: EventConfig, eventSlug: string): AttendingEventData {
  const city = event.tour?.city || event.geo?.country || '';
  const country = event.tour?.country || event.geo?.country || '';
  const shortName = event.shortName
    || (event.name.toLocaleLowerCase().includes('bsl') ? 'BSL' : event.series || event.name);
  const artworkTemplate: AttendingArtworkTemplate = {
    backgroundSrc: null,
    accentColor: event.branding?.primaryColor || event.color || '#27D8FF',
    secondaryAccentColor: '#156BFF',
    flagColors: [],
    hashtags: [`#${shortName.replace(/\s+/g, '')}`],
    poweredByLogoSrc: POWERED_BY_LOGO,
    ...ARTWORK_TEMPLATE_OVERRIDES[event.id],
  };

  return {
    slug: eventSlug,
    id: event.id,
    name: event.title || event.name,
    shortName,
    city,
    country,
    venue: event.tour?.venue || '',
    color: event.branding?.primaryColor || event.color || '#0E7490',
    logoSrc: getLogoSrc(event),
    startDate: event.eventStartDate || null,
    endDate: event.eventEndDate || null,
    dateFallback: event.eventDateString || null,
    website: event.website || '',
    artworkTemplate,
  };
}

export function makeCustomAttendingEventData(): AttendingEventData {
  return {
    slug: 'community',
    id: 'community',
    name: '',
    shortName: 'EVENT',
    city: '',
    country: '',
    venue: '',
    color: '#156BFF',
    logoSrc: POWERED_BY_LOGO,
    startDate: null,
    endDate: null,
    dateFallback: null,
    website: '',
    artworkTemplate: {
      backgroundSrc: null,
      accentColor: '#27D8FF',
      secondaryAccentColor: '#156BFF',
      flagColors: [],
      hashtags: ['#HASHPASSClub'],
      poweredByLogoSrc: POWERED_BY_LOGO,
    },
  };
}

export function makeAttendingMetadata(event: EventConfig, eventSlug: string): Metadata {
  const eventName = event.title || event.name;
  const logoSrc = makeAttendingEventData(event, eventSlug).logoSrc;
  const pageUrl = getAttendingEventUrl(eventSlug);
  const socialImageUrl = new URL(logoSrc, pageUrl).toString();
  return {
    title: { absolute: `Attending ${eventName} | HASHPASS Club` },
    description: `Create a personal, event-branded image for ${eventName}. A shared image expresses your intention; it is not an RSVP or ticket.`,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: 'website',
      url: pageUrl,
      title: `Attending ${eventName}`,
      description: `Make a personal event image for ${eventName}.`,
      images: [socialImageUrl],
    },
    twitter: {
      card: 'summary_large_image',
      title: `Attending ${eventName}`,
      description: `Make a personal event image for ${eventName}.`,
      images: [socialImageUrl],
    },
  };
}
