/**
 * Redirect handler for /auth/ (with trailing slash)
 * Redirects to /auth (without trailing slash) to match Expo Router routing
 */

import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator, Platform } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

export default function AuthIndexRedirect() {
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    // Redirect to /auth (without trailing slash)
    // On web, handle trailing slash redirect immediately
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      if (currentPath === '/auth/') {
        window.location.replace('/auth');
        return;
      }
    }
    router.replace('/(shared)/auth' as any);
  }, [router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.default }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

