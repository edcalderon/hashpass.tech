import '../config/reanimated'; // CRITICAL: Ensure Reanimated is imported and configured first
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack, useRouter, usePathname, useSegments } from "expo-router";
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StatusBar, Platform } from 'react-native';
import { ThemeProvider } from '../providers/ThemeProvider';
import { LanguageProvider } from '../providers/LanguageProvider';
import { EventProvider } from '../contexts/EventContext';
import { ToastProvider } from '../contexts/ToastContext';
import { ScrollProvider } from '../contexts/ScrollContext';
import { NotificationProvider } from '../contexts/NotificationContext';
import { BalanceProvider } from '../contexts/BalanceContext';
import { useTheme, useThemeProvider } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { authService } from '@hashpass/auth';
import { supabase } from '../lib/supabase';
import { passSystemService } from '../lib/pass-system';
import "./global.css";
import PWAPrompt from '../components/PWAPrompt';
import VersionUpdateNotification from '../components/VersionUpdateNotification';
import * as SplashScreen from 'expo-splash-screen';
import { I18nProvider } from '../providers/I18nProvider';
import { CopilotProvider } from 'react-native-copilot';
import { checkVersionOnStart, clearAuthCache } from '../lib/version-checker';
import { showConsoleWelcome } from '../lib/console-welcome';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const theme = useThemeProvider();

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider value={theme}>
          <StatusBar
            barStyle={theme.isDark ? 'light-content' : 'dark-content'}
            backgroundColor={theme.colors.background.default}
          />
          <EventProvider>
            <LanguageProvider>
              <I18nProvider>
                <NotificationProvider>
                  <BalanceProvider>
                    <ToastProvider>
                      <ScrollProvider>
                        <CopilotProvider overlay="view">
                          <ThemedContent />
                        </CopilotProvider>
                      </ScrollProvider>
                    </ToastProvider>
                  </BalanceProvider>
                </NotificationProvider>
              </I18nProvider>
            </LanguageProvider>
          </EventProvider>
        </ThemeProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

function ThemedContent() {
  // All hooks must be called unconditionally at the top level
  const { colors, isDark } = useTheme();
  const pathname = usePathname();
  const segments = useSegments();
  const router = useRouter();
  const { user, isLoggedIn, isLoading } = useAuth();
  const [isReady, setIsReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [versionUpdate, setVersionUpdate] = useState<{ currentVersion: string; latestVersion: string } | null>(null);
  const [lastRedirectTime, setLastRedirectTime] = useState(0);
  const AUTH_RECENT_SUCCESS_KEY = 'auth_recent_success_at';
  const AUTH_REDIRECT_GRACE_MS = 12000;

  // Check version on first load (web only) and initialize console welcome
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Initialize console welcome message
      showConsoleWelcome();

      // Check version immediately
      checkVersionOnStart().catch((error) => {
        console.error('Version check failed:', error);
      });

      // Listen for version update messages from service worker
      const handleServiceWorkerMessage = (event: MessageEvent) => {
        if (event.data && event.data.type === 'VERSION_UPDATE_AVAILABLE') {
          console.log('📦 Version update available:', event.data);
          setVersionUpdate({
            currentVersion: event.data.currentVersion,
            latestVersion: event.data.latestVersion,
          });
        }
      };

      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);

      return () => {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      };
    }
  }, []);

  // Ensure new Directus users get default passes created
  useEffect(() => {
    const ensureUserPass = async () => {
      if (user && isLoggedIn && !isLoading) {
        try {
          // Check if user has a pass for the current event
          const passInfo = await passSystemService.getUserPassInfo(user.id);
          if (!passInfo) {
            console.log('🎫 No pass found for user, creating default pass...');
            const passId = await passSystemService.createDefaultPass(user.id, 'general');
            if (passId) {
              console.log('✅ Default pass created successfully:', passId);
            } else {
              console.warn('⚠️ Failed to create default pass');
            }
          }
        } catch (error) {
          console.error('❌ Error ensuring user pass:', error);
          // Don't block app if pass creation fails
        }
      }
    };

    ensureUserPass();
  }, [user, isLoggedIn, isLoading]);

  // Check if we're in the auth flow
  const isAuthFlow = (segments[0] === '(shared)' && segments[1] === 'auth') || pathname.startsWith('/(shared)/auth') || pathname.startsWith('/auth');
  const isEventPublic = pathname.startsWith('/events/');
  const isHomePage = pathname === '/home' || pathname === '/' || pathname === '/index';
  // Public pages that don't require authentication
  const isPublicPage =
    pathname === '/docs' ||
    pathname === '/(shared)/docs' ||
    pathname === '/privacy' ||
    pathname === '/(shared)/privacy' ||
    pathname === '/terms' ||
    pathname === '/(shared)/terms' ||
    pathname === '/status';

  // Handle loading state and splash screen
  useEffect(() => {
    if (!isLoading) {
      setIsReady(true);
    }
  }, [isLoading]);

  // Handle splash screen hiding
  useEffect(() => {
    if (isReady) {
      const hideSplash = async () => {
        await SplashScreen.hideAsync();
        setShowSplash(false);
      };
      hideSplash();
    }
  }, [isReady]);

  // Handle auth redirection with session verification
  useEffect(() => {
    const shouldDelayRedirectForRecentAuth = () => {
      if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.sessionStorage) {
        return false;
      }

      const rawTimestamp = window.sessionStorage.getItem(AUTH_RECENT_SUCCESS_KEY);
      if (!rawTimestamp) return false;

      const timestamp = Number(rawTimestamp);
      if (!Number.isFinite(timestamp)) {
        window.sessionStorage.removeItem(AUTH_RECENT_SUCCESS_KEY);
        return false;
      }

      const age = Date.now() - timestamp;
      if (age > AUTH_REDIRECT_GRACE_MS) {
        window.sessionStorage.removeItem(AUTH_RECENT_SUCCESS_KEY);
        return false;
      }

      return true;
    };

    const triggerAuthRecheck = () => {
      authService.getSession().catch((error) => {
        console.debug('Auth recheck during redirect grace failed:', error);
      });
    };

    if (isReady && !isLoading) {
      // Don't redirect if we're in the middle of an auth callback
      const isAuthCallback = pathname === '/(shared)/auth/callback';
      if (isAuthCallback) {
        console.log('⏸️ In auth callback, skipping redirect check');
        return;
      }

      // Check if we're on the callback route - don't redirect during OAuth processing
      const isCallbackRoute = pathname.includes('/auth/callback');

      // Check if accessing protected dashboard routes
      // Note: Expo Router strips group segments from usePathname(), so pathname
      // is typically /dashboard/... not /(shared)/dashboard/...
      const isDashboardRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/(shared)/dashboard');

      if (isCallbackRoute) {
        // Don't redirect during callback processing - let the callback handler manage navigation
        console.log('🔄 On callback route, skipping session check to allow OAuth processing');
        return;
      }

      if (isDashboardRoute && !isLoggedIn) {
        if (shouldDelayRedirectForRecentAuth()) {
          console.log('⏳ Recent auth success detected; delaying dashboard redirect and rechecking session.');
          triggerAuthRecheck();
          return;
        }

        // For dashboard routes, check if user is logged in via provider-agnostic auth
        // Throttle redirects to prevent redirect loops
        const now = Date.now();
        if (now - lastRedirectTime < 5000) {
          console.warn('⚠️ Redirect throttled - last redirect was less than 5 seconds ago');
          return;
        }

        console.warn('⚠️ Not authenticated on dashboard route, redirecting to auth');
        setLastRedirectTime(now);
        router.replace('/(shared)/auth' as any);
      } else if (!isLoggedIn && !isAuthFlow && !isEventPublic && !isHomePage && !isPublicPage) {
        if (shouldDelayRedirectForRecentAuth()) {
          console.log('⏳ Recent auth success detected; delaying general redirect and rechecking session.');
          triggerAuthRecheck();
          return;
        }

        // Throttle redirects to prevent redirect loops
        const now = Date.now();
        if (now - lastRedirectTime < 5000) {
          console.warn('⚠️ Redirect throttled - last redirect was less than 5 seconds ago');
          return;
        }

        console.warn('⚠️ Not authenticated on general route, redirecting to auth');
        setLastRedirectTime(now);
        router.replace('/(shared)/auth' as any);
      }
    }
  }, [isLoggedIn, isAuthFlow, isEventPublic, isHomePage, isPublicPage, isReady, isLoading, router, pathname, lastRedirectTime]);

  // Show loading state
  if (isLoading || !isReady || showSplash) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.default }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: isDark ? colors.primaryDark : colors.background.paper,
          },
          headerStyle: {
            backgroundColor: isDark ? '#0A0A0A' : colors.background.default,
          } as any, // Type assertion to handle platform-specific styles
          headerTintColor: isDark ? '#FFFFFF' : colors.text.primary,
          headerTitleStyle: {
            color: isDark ? '#FFFFFF' : colors.text.primary,
            fontWeight: '600',
          },
          headerBackTitle: undefined,
          animation: 'slide_from_right',
          animationTypeForReplace: 'push',
        }}
      >
        {/* Always register routes to avoid linking mismatches */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="auth/index" options={{ headerShown: false }} />
        <Stack.Screen name="(shared)/auth" options={{ headerShown: false }} />
        <Stack.Screen name="(shared)/auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="(shared)/privacy" options={{ headerShown: false }} />
        <Stack.Screen name="(shared)/terms" options={{ headerShown: false }} />
        <Stack.Screen name="(shared)/docs" options={{ headerShown: false }} />
        <Stack.Screen name="(shared)/support" options={{ headerShown: false }} />
        <Stack.Screen name="status" options={{ headerShown: false }} />
        <Stack.Screen name="privacy" options={{ headerShown: false }} />
        <Stack.Screen name="terms" options={{ headerShown: false }} />
        <Stack.Screen
          name="(shared)/dashboard"
          options={{
            headerShown: false
          }}
        />
        <Stack.Screen
          name="(shared)/dashboard/qr-view"
          options={{
            headerShown: false
          }}
        />
        <Stack.Screen
          name="(shared)/dashboard/pass-details"
          options={{
            headerShown: false
          }}
        />
        {/* Dynamic Event routes */}
        <Stack.Screen name="events/[eventSlug]/home" options={{ headerShown: false }} />
        <Stack.Screen name="events/[eventSlug]/speakers/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="events/[eventSlug]/speakers/calendar" options={{ headerShown: false }} />
        <Stack.Screen name="events/[eventSlug]/my-bookings" options={{ headerShown: false }} />
        <Stack.Screen name="events/[eventSlug]/speaker-dashboard" options={{ headerShown: false }} />
      </Stack>
      <PWAPrompt />
      {versionUpdate && (
        <VersionUpdateNotification
          currentVersion={versionUpdate.currentVersion}
          latestVersion={versionUpdate.latestVersion}
          onUpdateComplete={() => setVersionUpdate(null)}
        />
      )}
    </>
  );
}
