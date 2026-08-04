import { Stack, useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../../hooks/useTheme';
import { ScrollProvider } from '@contexts/ScrollContext';
import { useEvent } from '@contexts/EventContext';

export default function BSL2025Layout() {
  const { isDark, colors } = useTheme();
  const { event } = useEvent();
  const router = useRouter();
  const eventTitle = event?.title || 'Event';

  // Some entry points into this stack (redirects, deep links, tab resets)
  // can leave a screen with no real navigation history to pop, at which
  // point the platform default just hides the back button and strands the
  // user. Always render a back control; fall back to the event home screen
  // when there's genuinely nothing to go back to.
  const renderBackButton = () => (
    <TouchableOpacity
      onPress={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace(`/events/${event?.id || 'bsl'}/home`);
        }
      }}
      style={{ paddingHorizontal: 8, paddingVertical: 4 }}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
    </TouchableOpacity>
  );

  return (
    <ScrollProvider>
      <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.background.paper,
        },
        headerTintColor: colors.text.primary,
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: 18,
        },
        headerBackTitleStyle: {
          fontSize: 16,
        },
        headerLeft: renderBackButton,
        contentStyle: {
          backgroundColor: colors.background.default,
        },
        animation: 'slide_from_right',
        gestureEnabled: true,
        gestureDirection: 'horizontal',
      }}
    >
      <Stack.Screen 
        name="home" 
        options={{
          title: eventTitle,
          headerShown: false, // Hide header for home as it has its own
        }}
      />
      <Stack.Screen 
        name="my-bookings" 
        options={{
          title: 'My Bookings',
          headerBackTitle: eventTitle,
        }}
      />
      <Stack.Screen 
        name="speakers" 
        options={{
          headerShown: false, // Let speakers/_layout.tsx handle its own headers
        }}
      />
      <Stack.Screen 
        name="agenda" 
        options={{
          title: 'Event Agenda',
          headerBackTitle: eventTitle,
        }}
      />
      <Stack.Screen
        name="schedule/live/[shareToken]"
        options={{
          title: 'Live Agenda',
          headerBackTitle: eventTitle,
        }}
      />
      <Stack.Screen 
        name="event-info" 
        options={{
          title: 'Event Information',
          headerBackTitle: eventTitle,
        }}
      />
      <Stack.Screen
        name="networking/index"
        options={{
          title: 'Networking',
          headerBackTitle: eventTitle,
        }}
      />
      <Stack.Screen 
        name="networking/my-requests" 
        options={{
          title: 'My Meeting Requests',
          headerBackTitle: 'Networking',
        }}
      />
      <Stack.Screen 
        name="networking/analytics" 
        options={{
          title: 'System Analytics',
          headerBackTitle: 'Networking',
        }}
      />
      <Stack.Screen 
        name="networking/my-schedule" 
        options={{
          title: 'My Schedule',
          headerBackTitle: 'Networking',
        }}
      />
      <Stack.Screen 
        name="networking/blocked" 
        options={{
          headerShown: false, // Hide header - blocked.tsx has its own custom header
        }}
      />
      <Stack.Screen
        name="networking/meeting-chat"
        options={{
          title: 'Meeting Chat',
          headerBackTitle: 'Speaker Dashboard',
        }}
      />
      <Stack.Screen
        name="networking/meeting-detail"
        options={{
          title: 'Meeting Details',
          headerShown: false,
          presentation: 'modal',
          animation: 'slide_from_bottom',
          headerBackVisible: false,
          gestureEnabled: true,
          gestureDirection: 'vertical',
        }}
      />
      </Stack>
    </ScrollProvider>
  );
}
