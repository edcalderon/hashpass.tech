import type { Metadata } from 'next';
import { AttendingLandingExperience } from './AttendingLandingExperience';
import { getUpcomingFeaturedAttendingEvents } from './event-data';

const ATTENDING_SITE_URL = 'https://attending.hashpass.club';

export const metadata: Metadata = {
  title: { absolute: 'Create your event intention image | HASHPASS Club' },
  description: 'Choose an upcoming event, make a personal attending image, and share your intention. It is not an RSVP, ticket, or proof of attendance.',
  alternates: { canonical: ATTENDING_SITE_URL },
  openGraph: {
    type: 'website',
    url: ATTENDING_SITE_URL,
    siteName: 'HASHPASS Club · Attending',
    title: 'Show up before the doors open.',
    description: 'Make a personal event intention image and share it with your community.',
    images: [`${ATTENDING_SITE_URL}/og-image.png`],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HASHPASS Club · Event intentions',
    description: 'Make a personal event intention image and share it with your community.',
    images: [`${ATTENDING_SITE_URL}/og-image.png`],
  },
};

export default function AttendingLandingPage() {
  return <AttendingLandingExperience events={getUpcomingFeaturedAttendingEvents()} />;
}
