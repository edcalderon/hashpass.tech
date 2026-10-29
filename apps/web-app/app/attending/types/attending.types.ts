import type { ReactNode } from 'react';
import type { SupportedLocale } from '@hashpass/i18n';

export type AttendingLocale = SupportedLocale;

export type AttendeePhotoSource = 'hashpass' | 'upload' | 'initials';

export type AttendingEventLinkOrigin = 'club' | 'tenant';

export interface ProcessedAttendeePhoto {
  source: string;
  url: string;
}

export type AttendingRoutePageProps = { params: Promise<{ eventSlug: string }> };

export interface AttendingLandingProps {
  events: AttendingEventData[];
  showCustomEventCard?: boolean;
  brandHref?: string;
  eventLinkOrigin?: AttendingEventLinkOrigin;
}

export interface AttendingExperienceProps {
  event: AttendingEventData;
  customEvent?: boolean;
  brandHref?: string;
  footerHref?: string;
  eventPageUrl?: string;
  footerMode?: 'club' | 'tenant';
}

export interface AttendingEventFooterProps {
  event: AttendingEventData;
  returnHref: string;
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
  xHandle?: string;
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
  themeMode: 'dark' | 'light';
  eventName: string;
  shortName: string;
  location: string;
  venue: string;
  dateLabel: string;
  attendeeName: string;
  attendeeRole: string;
  attendeeSocialHandles: AttendeeSocialHandles;
  logoSrc: string;
  avatarSrc: string | null;
  transparentPortrait: boolean;
  artworkTemplate: AttendingArtworkTemplate;
  poweredByLabel: string;
  pastEvent: boolean;
  intentions: {
    upcoming: string;
    past: string;
    emptyName: string;
  };
}

export interface AttendeeSocialHandles {
  x: string;
  instagram: string;
}

export type AttendeeSocialPlatform = keyof AttendeeSocialHandles;

export type AttendingPublicShareIntent = 'share' | 'x' | 'linkedin' | 'copy';

export interface AttendingPublicShare {
  url: string;
  imageUrl: string;
  expiresAt: string;
  emailStatus: 'sent' | 'unavailable' | 'not_requested';
}

export interface AttendingPublicShareResponse {
  shareUrl?: string;
  imageUrl?: string;
  expiresAt?: string;
  emailStatus?: 'sent' | 'unavailable' | 'not_requested';
  message?: string;
  captchaExpired?: boolean;
}
