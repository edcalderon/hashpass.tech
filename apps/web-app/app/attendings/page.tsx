import type { Metadata } from 'next';
import { AttendingLandingExperience } from '../attending/AttendingLandingExperience';
import { getUpcomingFeaturedAttendingEvents } from '../attending/event-data';

const CANONICAL_URL = 'https://hashpass.club/attendings/';
const SOCIAL_IMAGE_URL = 'https://hashpass.club/og-image.png';

export const metadata: Metadata = {
  title: { absolute: 'Show up before the doors open. | HASHPASS Club' },
  description: 'Choose an upcoming event, make a personal attending image, and share your intention. It is not an RSVP, ticket, or proof of attendance.',
  alternates: { canonical: CANONICAL_URL },
  openGraph: {
    type: 'website',
    url: CANONICAL_URL,
    siteName: 'HASHPASS Club · Attending',
    title: 'Show up before the doors open.',
    description: 'Make a personal event intention image and share it with your community.',
    images: [SOCIAL_IMAGE_URL],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HASHPASS Club · Event intentions',
    description: 'Make a personal event intention image and share it with your community.',
    images: [SOCIAL_IMAGE_URL],
  },
};

export default function AttendingEventsPage() {
  return <AttendingLandingExperience events={getUpcomingFeaturedAttendingEvents()} />;
}
