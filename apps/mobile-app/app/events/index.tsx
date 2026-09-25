import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
/** Compatibility URL; the app Explorer is the single public discovery route. */
export default function EventsIndexRedirect() {
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  return <Redirect href={{ pathname: '/dashboard/explore', params: typeof eventId === 'string' ? { eventId } : {} }} />;
}
