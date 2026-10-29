import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AttendingExperience } from '../AttendingExperience';
import { ATTENDING_EVENT_SLUGS, makeAttendingEventData, makeAttendingMetadata, resolveAttendingEvent } from '../event-data';
import type { AttendingRoutePageProps } from '../types/attending.types';

export const dynamicParams = false;

export function generateStaticParams() {
  return ATTENDING_EVENT_SLUGS.map((eventSlug) => ({ eventSlug }));
}

export async function generateMetadata({ params }: AttendingRoutePageProps): Promise<Metadata> {
  const { eventSlug } = await params;
  const event = resolveAttendingEvent(eventSlug);
  if (!event) return { title: 'Attending image' };
  return makeAttendingMetadata(event, eventSlug);
}

export default async function AttendingPage({ params }: AttendingRoutePageProps) {
  const { eventSlug } = await params;
  const event = resolveAttendingEvent(eventSlug);
  if (!event) notFound();
  return <AttendingExperience event={makeAttendingEventData(event, eventSlug)} />;
}
