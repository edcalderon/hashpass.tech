import type { Metadata } from 'next';
import { EventsExperience } from './EventsExperience';

export const metadata: Metadata = {
  title: 'Events — host, discover, and share',
  description: 'Create beautiful event pages, collect RSVPs, and share your public event calendar with HASHPASS.',
  alternates: { canonical: 'https://hashpass.tech/events/' },
};

export default function EventsPage() {
  return <EventsExperience />;
}
