import { Redirect } from 'expo-router';
import { useEvent } from '@contexts/EventContext';

export default function SpeakersIndex() {
  const { event } = useEvent();
  return <Redirect href={`/events/${event?.id || 'bsl'}/speakers/calendar`} />;
}
