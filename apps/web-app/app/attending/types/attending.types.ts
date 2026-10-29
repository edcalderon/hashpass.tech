import type { ReactNode } from 'react';

export type AttendingLocale = 'en' | 'es';

export type AttendeePhotoSource = 'hashpass' | 'upload' | 'initials';

export type AttendingRoutePageProps = { params: Promise<{ eventSlug: string }> };

export interface AttendingLandingProps {
  events: AttendingEventData[];
}

export interface AttendingLandingStepProps {
  icon: ReactNode;
  number: string;
  title: string;
  body: string;
}

export interface AttendingArtworkTemplate {
  backgroundSrc: string | null;
  accentColor: string;
  secondaryAccentColor: string;
  flagColors: string[];
  hashtags: string[];
  poweredByLogoSrc: string;
}

export interface AttendingEventData {
  slug: string;
  id: string;
  name: string;
  shortName: string;
  city: string;
  country: string;
  venue: string;
  color: string;
  logoSrc: string;
  startDate: string | null;
  endDate: string | null;
  dateFallback: string | null;
  website: string;
  artworkTemplate: AttendingArtworkTemplate;
}

export interface AttendingArtworkOptions {
  eventName: string;
  shortName: string;
  location: string;
  venue: string;
  dateLabel: string;
  attendeeName: string;
  attendeeRole: string;
  attendeeSocialHandle: string;
  logoSrc: string;
  avatarSrc: string | null;
  artworkTemplate: AttendingArtworkTemplate;
  poweredByLabel: string;
  pastEvent: boolean;
  intentions: {
    upcoming: string;
    past: string;
    emptyName: string;
  };
}
