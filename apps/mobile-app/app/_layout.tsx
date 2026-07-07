import '../config/reanimated'; // CRITICAL: Ensure Reanimated is imported and configured first
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack, useRouter, usePathname, useSegments } from "expo-router";
import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { SystemBars } from 'react-native-edge-to-edge';
import { ThemeProvider } from '../providers/ThemeProvider';
import { LanguageProvider } from '../providers/LanguageProvider';
import { EventProvider } from '@contexts/EventContext';
import { ToastProvider } from '@contexts/ToastContext';
import { ScrollProvider } from '@contexts/ScrollContext';
import { NotificationProvider } from '@contexts/NotificationContext';
import { BalanceProvider } from '@contexts/BalanceContext';
import { AnimationLevelProvider } from '@contexts/AnimationLevelContext';
import { useTheme, useThemeProvider } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { authService } from '@hashpass/auth';
import { supabase } from '../lib/supabase';
import { passSystemService } from '../lib/pass-system';
import "./global.css";
import PWAPrompt from '../components/PWAPrompt';
import VersionUpdateNotification from '../components/VersionUpdateNotification';
import ForceUpdateScreen from '../components/ForceUpdateScreen';
import SoftUpdateBanner from '../components/SoftUpdateBanner';
import { useNativeUpdateCheck } from '../hooks/useNativeUpdateCheck';
import * as SplashScreen from 'expo-splash-screen';
import { I18nProvider } from '../providers/I18nProvider';
import { CopilotProvider } from 'react-native-copilot';
import { checkVersionOnStart, clearAuthCache } from '../lib/version-checker';
import { showConsoleWelcome } from '../lib/console-welcome';
import LoadingScreen from '../components/LoadingScreen';
import { AppErrorBoundary, installGlobalErrorHandler } from '../components/AppErrorBoundary';
import { configureNativeGoogleSignin } from '../lib/native-google-signin';
import { shouldUseNativeGoogleSignin } from '../lib/native-google-signin-config';
import { hasRecentAuthSuccess } from '../lib/auth/recent-auth';
import { resolveGoogleOAuthClientId } from '../lib/auth/oauth/google-credentials';
import packageJson from '../package.json';

const startupStamp = process.env.EXPO_PUBLIC_RELEASE_COMMIT
  ? `v${packageJson.version} · ${process.env.EXPO_PUBLIC_RELEASE_COMMIT}`
  : `v${packageJson.version} · local build`;

// Surface JS errors thrown outside React render (async/native bridge) instead
// of letting the app close with a blank screen.
installGlobalErrorHandler();

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const theme = useThemeProvider();

  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <ThemeProvider value={theme}>
            <View style={{ flex: 1, backgroundColor: theme.colors.background.default }}>
              <SystemBars style={theme.isDark ? 'light' : 'dark'} />
              <EventProvider>
                <LanguageProvider>
                  <I18nProvider>
                    <NotificationProvider>
                      <BalanceProvider>
                        <AnimationLevelProvider>
                          <ToastProvider>
                            <ScrollProvider>
                              <CopilotProvider overlay="view">
                                <ThemedContent />
                              </CopilotProvider>
                            </ScrollProvider>
                          </ToastProvider>
                        </AnimationLevelProvider>
                      </BalanceProvider>
                    </NotificationProvider>
                  </I18nProvider>
                </LanguageProvider>
              </EventProvider>
            </View>
          </ThemeProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}

function ThemedContent() {
  // All hooks must be called unconditionally at the top level
  const { colors, isDark } = useTheme();
  const pathname = usePathname();
  const segments = useSegments();
  const router = useRouter();
  const { user, isLoggedIn, isLoading } = useAuth();
  const nativeUpdate = useNativeUpdateCheck();
  const [isReady, setIsReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [versionUpdate, setVersionUpdate] = useState<{ currentVersion: string; latestVersion: string } | null>(null);
  const [lastRedirectTime, setLastRedirectTime] = useState(0);

  // Check version on first load (web only) and initialize console welcome
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Initialize console welcome message
      showConsoleWelcome();

      // Check version immediately
      checkVersionOnStart().catch((error: unknown) => {
        console.error('Version check failed:', error);
      });

      // Listen for version update messages from service worker
      const handleServiceWorkerMessage = (event: MessageEvent) => {
        if (event.data && event.data.type === 'VERSION_UPDATE_AVAILABLE') {
          console.log('📦 Version update available (SW):', event.data);
          setVersionUpdate({
            currentVersion: event.data.currentVersion,
            latestVersion: event.data.latestVersion,
          });
        }
      };

      // Listen for version update events dispatched by version-checker
      const handleVersionUpdateEvent = (event: Event) => {
        const e = event as CustomEvent<{ currentVersion: string; latestVersion: string }>;
        if (e.detail) {
          console.log('📦 Version update available (checker):', e.detail);
          setVersionUpdate({
            currentVersion: e.detail.currentVersion,
            latestVersion: e.detail.latestVersion,
          });
        }
      };

      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
      window.addEventListener('hashpass:version-update', handleVersionUpdateEvent);

      return () => {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
        window.removeEventListener('hashpass:version-update', handleVersionUpdateEvent);
      };
    }
  }, []);

  // Configure native Google Sign-In SDK once on startup (native only, feature-flagged)
  useEffect(() => {
    const googleWebClientId = resolveGoogleOAuthClientId();
    const nativeGoogleFlag = process.env.EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN ?? '(default:true)';
    const nativeEnabled = shouldUseNativeGoogleSignin(googleWebClientId);
    console.log(
      `[GoogleSignin] native enabled=${nativeEnabled}`,
      `EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN=${nativeGoogleFlag}`,
      `webClientId=${googleWebClientId || '(unset)'}`,
    );
    if (!nativeEnabled) return;
    void configureNativeGoogleSignin(googleWebClientId);
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
  const isAuthFlow = (segments[0] === '(shared)' && (segments as string[])[1] === 'auth') || pathname.startsWith('/(shared)/auth') || pathname.startsWith('/auth');
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

  // Hide the native splash as soon as the React tree has mounted so the
  // stamped loading screen can surface during startup.
  useEffect(() => {
    let mounted = true;

    const hideSplash = async () => {
      try {
        await SplashScreen.hideAsync();
      } catch (error) {
        console.warn('Failed to hide splash screen:', error);
      } finally {
        if (mounted) {
          setShowSplash(false);
        }
      }
    };

    const timer = setTimeout(hideSplash, 0);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  // Handle auth redirection with session verification
  useEffect(() => {
    const shouldDelayRedirectForRecentAuth = () => {
      return hasRecentAuthSuccess();
    };

    const triggerAuthRecheck = () => {
      authService.getSession().catch((error: unknown) => {
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
      <LoadingScreen
        fullScreen
        message="Starting HASHPASS"
        subtitle={startupStamp}
      />
    );
  }

  // Hard block: this version is below the minimum supported version
  if (Platform.OS !== 'web' && nativeUpdate.needsHardUpdate && nativeUpdate.minimumVersion) {
    return (
      <ForceUpdateScreen
        minimumVersion={nativeUpdate.minimumVersion}
        storeUrl={nativeUpdate.storeUrl}
        storeWebUrl={nativeUpdate.storeWebUrl}
      />
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
        <Stack.Screen name="events/[eventSlug]/my-bookings" options={{ headerShown: false }} />
      </Stack>
      <PWAPrompt />
      {versionUpdate && (
        <VersionUpdateNotification
          currentVersion={versionUpdate.currentVersion}
          latestVersion={versionUpdate.latestVersion}
          onUpdateComplete={() => setVersionUpdate(null)}
        />
      )}
      {Platform.OS !== 'web' && nativeUpdate.needsSoftUpdate && nativeUpdate.latestVersion && (
        <SoftUpdateBanner
          latestVersion={nativeUpdate.latestVersion}
          storeUrl={nativeUpdate.storeUrl}
          storeWebUrl={nativeUpdate.storeWebUrl}
        />
      )}
    </>
  );
}
