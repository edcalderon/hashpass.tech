import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AttendingExperience } from '../../attending/AttendingExperience';
import { makeAttendingEventData, makeAttendingMetadata, resolveAttendingEvent } from '../../attending/event-data';
import type { AttendingRoutePageProps } from '../../attending/types/attending.types';
import { getAttendingClubEventUrl } from '../../../lib/attending-url';

const CLUB_ATTENDING_EVENT_SLUGS = ['bsl'] as const;

export const dynamicParams = false;

export function generateStaticParams() {
  return CLUB_ATTENDING_EVENT_SLUGS.map((eventSlug) => ({ eventSlug }));
}

export async function generateMetadata({ params }: AttendingRoutePageProps): Promise<Metadata> {
  const { eventSlug } = await params;
  const event = resolveAttendingEvent(eventSlug);
  if (!event || !(CLUB_ATTENDING_EVENT_SLUGS as readonly string[]).includes(eventSlug)) {
    return { title: 'Attending image' };
  }
  return makeAttendingMetadata(event, eventSlug, getAttendingClubEventUrl(eventSlug));
}

export default async function ClubAttendingEventPage({ params }: AttendingRoutePageProps) {
  const { eventSlug } = await params;
  const event = resolveAttendingEvent(eventSlug);
  if (!event || !(CLUB_ATTENDING_EVENT_SLUGS as readonly string[]).includes(eventSlug)) notFound();

  return (
    <AttendingExperience
      event={makeAttendingEventData(event, eventSlug)}
      brandHref="/attendings/"
      footerHref="/attendings/"
      eventPageUrl={getAttendingClubEventUrl(eventSlug)}
    />
  );
}
