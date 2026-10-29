import type { Metadata } from 'next';
import { AboutExperience } from './AboutExperience';

const CANONICAL_URL = 'https://hashpass.club/about/';
const SOCIAL_IMAGE_URL = 'https://hashpass.club/og-image.png';

export const metadata: Metadata = {
  title: 'About HASHPASS',
  description:
    'Who we are and why we build HASHPASS, the membership and event infrastructure for clubs, communities, organizers and attendees.',
  alternates: { canonical: CANONICAL_URL },
  openGraph: {
    type: 'website',
    url: CANONICAL_URL,
    siteName: 'hashpass.club',
    title: 'About HASHPASS',
    description: 'Membership and event infrastructure for clubs, communities, organizers and attendees.',
    images: [SOCIAL_IMAGE_URL],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About HASHPASS',
    description: 'Membership and event infrastructure for clubs, communities, organizers and attendees.',
    images: [SOCIAL_IMAGE_URL],
  },
};

export default function AboutPage() {
  return <AboutExperience />;
}
