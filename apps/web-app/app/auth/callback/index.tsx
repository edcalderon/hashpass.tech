/**
 * Redirect handler for /auth/callback/ (with trailing slash)
 * Redirects to /auth/callback (without trailing slash) to match Expo Router routing
 */

import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator, Platform } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';

export default function AuthCallbackRedirect() {
  const router = useRouter();
  const { colors } = useTheme();
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    // Prevent multiple redirects
    if (hasRedirectedRef.current) {
      return;
    }

    // Check sessionStorage to prevent loops
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
      const alreadyProcessed = window.sessionStorage.getItem('auth_callback_processed') === 'true';
      if (alreadyProcessed) {
        // If already processed, redirect directly to dashboard
        console.log('⏭️ Callback already processed, redirecting to dashboard');
        router.replace('/(shared)/dashboard/explore' as any);
        return;
      }
    }

    // Redirect to /auth/callback (without trailing slash)
    // On web, use router to avoid full page reload
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      const searchParams = window.location.search;
      const hash = window.location.hash;
      
      if (currentPath === '/auth/callback/') {
        hasRedirectedRef.current = true;
        const targetPath = `/auth/callback${searchParams}${hash}`;
        console.log('🔄 Redirecting from /auth/callback/ to /auth/callback');
        window.location.replace(targetPath);
        return;
      }
    }
    
    // For mobile, redirect to the callback route
    if (!hasRedirectedRef.current) {
      hasRedirectedRef.current = true;
      router.replace('/(shared)/auth/callback' as any);
    }
  }, [router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.default }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
