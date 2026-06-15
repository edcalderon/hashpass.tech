/**
 * Redirect handler for /auth/ (with trailing slash)
 * Forwards to the shared auth screen while preserving query params.
 */

import { useEffect, useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
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
    // Use client-side navigation only. Some hosts (Amplify/S3) enforce /auth -> /auth/
    // and a hard replace to /auth can create an infinite slash redirect loop.
    router.replace(redirectTarget as any);
  }, [redirectTarget, router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.default }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
