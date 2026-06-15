import { Stack } from 'expo-router';
import { useTheme } from '../../../hooks/useTheme';
import { ScrollProvider } from '@contexts/ScrollContext';
import { useEvent } from '@contexts/EventContext';

export default function BSL2025Layout() {
  const { isDark, colors } = useTheme();
  const { event } = useEvent();
  const eventTitle = event?.title || 'Event';

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
        name="event-info" 
        options={{
          title: 'Event Information',
          headerBackTitle: eventTitle,
        }}
      />
      <Stack.Screen 
        name="networking" 
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
        name="meeting-chat" 
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
      <Stack.Screen
        name="speakers/index"
        options={{
          title: 'Featured Speakers',
          headerBackTitle: 'Event',
        }}
      />
      <Stack.Screen
        name="speakers/[id]"
        options={{
          title: 'Speaker Details',
          headerBackTitle: 'Speakers',
        }}
      />
      <Stack.Screen
        name="speakers/calendar"
        options={{
          title: 'All Speakers',
          headerBackTitle: 'Speakers',
        }}
      />
      </Stack>
    </ScrollProvider>
  );
}
