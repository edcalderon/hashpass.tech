import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

// Quick-access hub tiles (Peru/Chile/Colombia/Archive on the BSL On Tour
// explorer) route here via /events/{eventSlug}/home. There is no dedicated
// per-event home screen, so this redirects back to the shared dashboard
// explorer — but it must carry eventSlug along as ?eventId=, otherwise the
// explorer loses which event was tapped and falls back to the tour hub
// instead of switching "Select Event" and Quick Access to that event.
export default function EventHomeRedirect() {
  const { eventSlug } = useLocalSearchParams<{ eventSlug: string }>();
  return <Redirect href={`/(shared)/dashboard/explore?eventId=${eventSlug}`} />;
}
