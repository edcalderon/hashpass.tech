import { Stack, useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../../../hooks/useTheme';
import { useEvent } from '@contexts/EventContext';

export default function SpeakersLayout() {
  const { isDark, colors } = useTheme();
  const { event } = useEvent();
  const router = useRouter();
  const eventTitle = event?.title || 'Explore';

  // index.tsx enters this stack via <Redirect> to calendar, which replaces
  // history rather than pushing -- if that redirect is the first navigation
  // into /speakers/* (deep link, tab reset, etc.), calendar ends up with no
  // history to pop and the platform default just hides the back button,
  // stranding the user. Always render a back control; fall back to the
  // event home screen when there's genuinely nothing to go back to.
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
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.background.paper,
          borderBottomWidth: 1,
          borderBottomColor: colors.divider,
          shadowColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        } as any, // NativeStackNavigationOptions['headerStyle'] only declares backgroundColor; these still apply at runtime as View style props
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
        name="index"
        options={{
          title: 'Featured Speakers',
          headerBackTitle: eventTitle,
          // Not in NativeStackNavigationOptions's current types but still respected at runtime.
          headerBackTitleVisible: true,
        } as any}
      />
      <Stack.Screen
        name="calendar"
        options={{
          title: 'All Speakers',
          headerBackTitle: eventTitle,
          headerBackTitleVisible: true,
        } as any}
      />
      <Stack.Screen
        name="[id]"
        options={({ route }) => ({
          title: 'Speaker Details',
          headerBackTitle: eventTitle,
          headerBackTitleVisible: true,
          // Dynamic title based on speaker name if available
          headerTitle: 'Speaker Details',
        }) as any}
      />
    </Stack>
  );
}
