import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { isDevAuthBypassEnabled } from '../../../lib/auth/dev-bypass';

// Quick-access hub tiles (Peru/Chile/Colombia/Archive on the BSL On Tour
// explorer) route here via /events/{eventSlug}/home. There is no dedicated
// per-event home screen, so this redirects onward -- but WHERE depends on
// auth state, which this previously ignored entirely: every visitor,
// logged in or not, was sent straight into /(shared)/dashboard/explore (a
// protected route). An unauthenticated visitor would render there for real
// (dashboard's own guard only bounces them out after a multi-second grace
// period, by design, to avoid a native crash on a transient auth flap --
// see dashboard/_layout.tsx) before finally landing on the auth screen.
// Logged-in visitors keep going to the dashboard explorer, carrying
// eventSlug along as ?eventId= so the explorer switches "Select Event" and
// Quick Access to that event instead of falling back to the tour hub.
// Logged-out visitors go to the event's own public info page instead.
export default function EventHomeRedirect() {
  const { eventSlug } = useLocalSearchParams<{ eventSlug: string }>();
  const { isLoggedIn, isLoading } = useAuth();

  if (isLoading && !isDevAuthBypassEnabled()) {
    return null;
  }

  if (isLoggedIn || isDevAuthBypassEnabled()) {
    return (
      <Redirect href={`/(shared)/dashboard/explore?eventId=${eventSlug}`} />
    );
  }

  return <Redirect href={`/events/${eventSlug}/event-info`} />;
}
