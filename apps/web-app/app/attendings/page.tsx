import type { Metadata } from 'next';
import { AttendingExperience } from '../attending/AttendingExperience';
import { makeGenericAttendingData } from '../attending/event-data';

const CANONICAL_URL = 'https://hashpass.club/attendings/';

export const metadata: Metadata = {
  title: { absolute: 'Make a shareable personal artwork | HASHPASS Club' },
  description: 'Create a personal, shareable HASHPASS artwork with your name, photo or initials. No event required.',
  alternates: { canonical: CANONICAL_URL },
  openGraph: {
    type: 'website',
    url: CANONICAL_URL,
    siteName: 'HASHPASS Club',
    title: 'Make this moment yours.',
    description: 'Create a personal artwork with your name, photo or initials and share it your way.',
    images: ['https://hashpass.club/attending/og-image.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HASHPASS Club · Personal artwork',
    description: 'Create and share a personal HASHPASS artwork. No event required.',
    images: ['https://hashpass.club/attending/og-image.png'],
  },
};

export default function PersonalArtworkPage() {
  return <AttendingExperience event={makeGenericAttendingData()} generic />;
}
