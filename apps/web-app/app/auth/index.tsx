/**
 * Redirect handler for /auth/ (with trailing slash)
 * Redirects to /auth (without trailing slash) to match Expo Router routing
 */

import { useEffect, useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, ActivityIndicator, Platform } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

export default function AuthIndexRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors } = useTheme();

  const redirectTarget = useMemo(() => {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (typeof entry === 'string') {
            searchParams.append(key, entry);
          }
        });
        return;
      }

      if (typeof value === 'string') {
        searchParams.set(key, value);
      }
    });

    const query = searchParams.toString();
    return query ? `/(shared)/auth?${query}` : '/(shared)/auth';
  }, [params]);

  useEffect(() => {
    // Redirect to /auth (without trailing slash)
    // On web, handle trailing slash redirect immediately
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      if (currentPath === '/auth/') {
        window.location.replace(`/auth${window.location.search}${window.location.hash}`);
        return;
      }
    }
    router.replace(redirectTarget as any);
  }, [redirectTarget, router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.default }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
