import { Redirect, useLocalSearchParams } from 'expo-router';

export default function SpeakerDashboard() {
  const { eventSlug } = useLocalSearchParams<{ eventSlug: string }>();

  return (
    <Redirect
      href={{
        pathname: '/events/[eventSlug]/networking/my-requests',
        params: { eventSlug },
      }}
    />
  );
}
