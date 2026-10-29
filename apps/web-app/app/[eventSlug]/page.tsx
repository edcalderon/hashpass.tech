import { notFound } from 'next/navigation';
import { AttendingExperience } from '../attending/AttendingExperience';
import {
  ATTENDING_EVENT_SLUGS,
  makeAttendingEventData,
  makeAttendingMetadata,
  resolveAttendingEvent,
} from '../attending/event-data';
import type { AttendingRoutePageProps } from '../attending/types/attending.types';

// Legacy short event paths remain available. Production event links use the
// event's own host; BSL keeps its existing homepage and uses /attending/bsl/.
export const dynamicParams = false;

export function generateStaticParams() {
  return ATTENDING_EVENT_SLUGS.map((eventSlug) => ({ eventSlug }));
}

export async function generateMetadata({ params }: AttendingRoutePageProps) {
  const { eventSlug } = await params;
  const event = resolveAttendingEvent(eventSlug);
  if (!event) return { title: 'Attending image' };
  return makeAttendingMetadata(event, eventSlug);
}

export default async function StandaloneAttendingPage({ params }: AttendingRoutePageProps) {
  const { eventSlug } = await params;
  const event = resolveAttendingEvent(eventSlug);
  if (!event) notFound();
  return <AttendingExperience event={makeAttendingEventData(event, eventSlug)} />;
}
