import type { Metadata } from 'next';
import { AttendingExperience } from '../../attending/AttendingExperience';
import { makeCustomAttendingEventData } from '../../attending/event-data';

const CANONICAL_URL = 'https://hashpass.club/attendings/custom/';

export const metadata: Metadata = {
  title: { absolute: 'Create artwork for your event | HASHPASS Club' },
  description: 'Add your event name, date, location, and optional logo to create a personal artwork to share.',
  alternates: { canonical: CANONICAL_URL },
  openGraph: {
    type: 'website',
    url: CANONICAL_URL,
    siteName: 'HASHPASS Club · Attending',
    title: 'Create artwork for your event',
    description: 'Make a personal event image with your name, photo, and event details.',
    images: ['https://hashpass.club/og-image.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HASHPASS Club · Bring your event',
    description: 'Create and share artwork for an event that is not listed yet.',
    images: ['https://hashpass.club/og-image.png'],
  },
};

export default function CustomAttendingPage() {
  return <AttendingExperience event={makeCustomAttendingEventData()} customEvent />;
}
