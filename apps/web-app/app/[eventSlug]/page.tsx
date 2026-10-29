import { notFound } from 'next/navigation';
import { AttendingExperience } from '../attending/AttendingExperience';
import {
  ATTENDING_EVENT_SLUGS,
  makeAttendingEventData,
  makeAttendingMetadata,
  resolveAttendingEvent,
} from '../attending/event-data';
import type { AttendingRoutePageProps } from '../attending/types/attending.types';

// Root-level event pages are used when this static app is served from the
// proposed attending.hashpass.club host, so its public URLs can be /bsl.
export const dynamicParams = false;

export function generateStaticParams() {
  return ATTENDING_EVENT_SLUGS.map((eventSlug) => ({ eventSlug }));
}

export async function generateMetadata({ params }: AttendingRoutePageProps) {
  const { eventSlug } = await params;
  const event = resolveAttendingEvent(eventSlug);
  if (!event) return { title: 'Attending image' };
  return makeAttendingMetadata(event, eventSlug, true);
}

export default async function StandaloneAttendingPage({ params }: AttendingRoutePageProps) {
  const { eventSlug } = await params;
  const event = resolveAttendingEvent(eventSlug);
  if (!event) notFound();
  return <AttendingExperience event={makeAttendingEventData(event, eventSlug)} />;
}
