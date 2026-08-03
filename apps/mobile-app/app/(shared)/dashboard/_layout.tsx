import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Image, Platform, Animated as RNAnimated, ScrollView, useWindowDimensions, ActivityIndicator, type DimensionValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, interpolate, withSpring } from 'react-native-reanimated';
import { SystemBars } from 'react-native-edge-to-edge';
import { Ionicons } from '../../../lib/vector-icons';
import { useRouter, usePathname, useNavigation as useExpoNavigation } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { useDrawerStatus } from '@react-navigation/drawer';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@hashpass/types';
import { useTheme } from '../../../hooks/useTheme';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useAuth } from '../../../hooks/useAuth';
import { authService } from '@hashpass/auth';
import { useLanguage } from '../../../providers/LanguageProvider';
import { canLoadCurrentAdminAccess, getCurrentAdminAccess } from '../../../lib/admin-access';
import { ScrollProvider, useScroll } from '@contexts/ScrollContext';
import { NotificationProvider, useNotifications } from '@contexts/NotificationContext';
import { useEvent } from '@contexts/EventContext';
import { AnimationProvider, useAnimations } from '../../../providers/AnimationProvider';
import VersionDisplay from '../../../components/VersionDisplay';
import SafeBlurView from '../../../components/SafeBlurView';
import QRScanner from '../../../components/QRScanner';
import MiniNotificationDropdown from '../../../components/MiniNotificationDropdown';
import { hasRecentAuthSuccess } from '../../../lib/auth/recent-auth';
import { isDevAuthBypassEnabled } from '../../../lib/auth/dev-bypass';
import { navigateDashboardBrandToLanding } from '../../../lib/dashboard-navigation';
import { openTargetedDashboardDrawer } from '../../../lib/dashboard-drawer';
import { t } from '@lingui/macro';
import { CopilotStep, walkthroughable, useCopilot } from '@lib/copilot-shim';
import { hapticLight, hapticMedium } from '../../../lib/haptics';
import FlipWords from '../../../components/FlipWords';

const ANDROID_DASHBOARD_HEADER_HEIGHT = 64;
const ANDROID_DRAWER_EDGE_GUARD = 16;
const ANDROID_DRAWER_BOTTOM_GUARD = 56;

type DashboardDrawerInsets = {
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
};

const getDashboardDrawerInsets = (insets: DashboardDrawerInsets = {}) => ({
  top: Platform.OS === 'android'
    ? Math.max(insets.top || 0, StatusBar.currentHeight || 0)
    : insets.top || 0,
  left: Platform.OS === 'android'
    ? Math.max(insets.left || 0, ANDROID_DRAWER_EDGE_GUARD)
    : insets.left || 0,
  right: Platform.OS === 'android'
    ? Math.max(insets.right || 0, ANDROID_DRAWER_EDGE_GUARD)
    : insets.right || 0,
  bottom: Platform.OS === 'android'
    ? Math.max(insets.bottom || 0, ANDROID_DRAWER_BOTTOM_GUARD)
    : insets.bottom || 0,
});

type DrawerNavigation = any;

// navRef is an instance-scoped useRef owned by DashboardLayout (see below),
// not module-level state. A previous version used a module-level `let`
// here, which is a singleton shared by every mounted instance of this file
// — a nav-transition overlap or Fast Refresh remount could let one
// instance's cleanup null out (or a stale unmount overwrite) the ref another
// still-live instance depended on, risking a dispatch against a torn-down
// navigator, the same native-crash shape as the header-slot issue below.
// Scoping the ref per DashboardLayout instance removes that cross-instance
// hazard entirely.
type DrawerNavRef = React.MutableRefObject<DrawerNavigation | null>;

// Imperative escape hatch into the patched @react-navigation/drawer's own
// internal open/closed state (see patches/@react-navigation__drawer@7.8.1.patch).
// Root cause of the long-standing "hamburger does nothing on real Play
// builds" bug: a stale node_modules symlink on the CI release runner
// pointed apps/mobile-app at an orphaned, unpatched copy of
// @react-navigation/drawer (see the "force full node_modules
// reconciliation" commit in mobile-android-release.yml), so
// navigation.dispatch(DrawerActions.openDrawer()/closeDrawer()) was
// resolving against code that had never received this fix in the first
// place. Kept as the primary mechanism (rather than reverting to plain
// dispatch now that the packaging bug is fixed) because it's already
// verified working end-to-end on a real CI-built artifact and gives an
// extra layer of resilience against this class of bug recurring. Kept as
// a plain ref, not app-level React state, for the same reason drawerOpenRef
// below is a ref: wiring a reactive open/close flag into DashboardLayout's
// own render would cascade a full re-render into the header and gradient
// animations mid-slide, the exact perf regression drawerOpenRef was
// introduced to avoid.
type DrawerOpenControlRef = React.MutableRefObject<{ setOpen: (open: boolean) => void } | null>;

const CopilotTouchableOpacity = walkthroughable(TouchableOpacity);
const CopilotView = walkthroughable(View);

// Custom drawer content component
function CustomDrawerContent({
  navRef,
  navigation: drawerContentNavigation,
  onDrawerStatusChange,
  openCloseControlRef,
}: {
  navRef?: DrawerNavRef;
  navigation?: DrawerNavigation;
  onDrawerStatusChange?: (isOpen: boolean) => void;
  openCloseControlRef?: DrawerOpenControlRef;
}) {
  const { colors, isDark, toggleTheme } = useTheme();
  const { signOut, user, isLoading: authLoading, dbUserId } = useAuth();
  const { event } = useEvent();
  const { locale, setLocale } = useLanguage();
  const { unreadCount } = useNotifications();
  const { animationsEnabled } = useAnimations();
  const router = useRouter();
  const pathname = usePathname();
  // react-navigation's Drawer explicitly passes `navigation` as a prop to
  // whatever renders as drawerContent (part of DrawerContentComponentProps)
  // — that prop is guaranteed to be the Drawer navigator itself. Calling the
  // useNavigation() hook here instead resolves to the nearest ancestor Stack
  // navigator in this app's tree, NOT the Drawer — confirmed by logging
  // getState() on both and finding them identical, type: "stack". Every
  // dispatch(openDrawer()) sent through that ref was silently no-opping
  // against a Stack navigator that doesn't understand OPEN_DRAWER. Use the
  // prop, not the hook.
  const navigation = drawerContentNavigation as DrawerNavigation;
  // Written synchronously during render, not in an effect: CustomDrawerContent
  // receives `navigation` as soon as it renders, so waiting for an effect to
  // commit only reopens the exact race (a tap between mount and effect)
  // the "resolve drawer nav ref live" fix was meant to close. Assigning the
  // same value to a ref on every render is idempotent, so this is safe even
  // under Strict Mode's double-render in dev.
  if (navRef) {
    navRef.current = navigation;
  }
  // See the DrawerOpenControlRef comment above. Falls back to a plain
  // dispatch when the ref isn't populated yet (first render, before the
  // patched DrawerView's effect has run) -- that dispatch may itself be
  // subject to the same CI-only propagation bug this ref exists to route
  // around, but it's a harmless best-effort fallback, not the primary path.
  const setDrawerOpen = React.useCallback((open: boolean) => {
    if (openCloseControlRef?.current?.setOpen) {
      openCloseControlRef.current.setOpen(open);
      return;
    }
    try {
      navigation.dispatch(open ? DrawerActions.openDrawer() : DrawerActions.closeDrawer());
    } catch (drawerError) {
      console.error('Error toggling drawer (fallback dispatch):', drawerError);
    }
  }, [openCloseControlRef, navigation]);
  useEffect(() => {
    return () => {
      if (navRef && navRef.current === navigation) {
        navRef.current = null;
      }
    };
  }, [navigation, navRef]);
  const drawerStatus = useDrawerStatus();
  useEffect(() => {
    onDrawerStatusChange?.(drawerStatus === 'open');
  }, [drawerStatus, onDrawerStatusChange]);
  // Auto-collapse the drawer whenever the active route changes (i.e. a tab was
  // selected). This MUST live in an effect keyed on pathname — closing the
  // drawer inline in the menu tap handler (even deferred a frame) did not work:
  // expo-router's navigation state update from router.push() is async and lands
  // AFTER the inline closeDrawer(), leaving the sidebar open on top of the newly
  // selected screen (the reported "doesn't auto-collapse on tab change" bug,
  // reproduced live). By the time pathname has changed here, the navigation has
  // settled, so this closeDrawer() is the final word. Closing an already-closed
  // drawer is a harmless no-op, so no drawerStatus guard is needed.
  const previousPathnameRef = useRef(pathname);
  useEffect(() => {
    if (previousPathnameRef.current === pathname) {
      return;
    }
    previousPathnameRef.current = pathname;
    setDrawerOpen(false);
  }, [pathname, setDrawerOpen]);
  const copilotHook = useCopilot() as any;
  const isMobile = useIsMobile();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth } = useWindowDimensions();
  const compactQuickActions = viewportWidth < 480;
  const compactDrawerBranding = viewportWidth < 390;
  const drawerSafeInsets = getDashboardDrawerInsets(insets);
  const styles = getStyles(
    isDark,
    colors,
    isMobile,
    drawerSafeInsets,
    compactQuickActions,
    compactDrawerBranding,
  );
  const [isUserAdmin, setIsUserAdmin] = React.useState(false);
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const eventBadgeText = React.useMemo(() => {
    const configuredBadge = event?.branding?.badge?.trim();
    if (configuredBadge) return configuredBadge.startsWith('#') ? configuredBadge : `#${configuredBadge}`;
    const domain = event?.domain?.split('.')[0]?.replace(/[^a-z0-9]/gi, '').toUpperCase();
    return domain && domain !== 'HASHPASS' ? `#${domain}` : null;
  }, [event?.branding?.badge, event?.domain]);
  const [showEventBadge, setShowEventBadge] = React.useState(false);
  const badgeTransitionRef = React.useRef<RNAnimated.Value | null>(null);
  if (badgeTransitionRef.current === null) badgeTransitionRef.current = new RNAnimated.Value(1);
  const badgeTransition = badgeTransitionRef.current;
  const brandBadgeText = showEventBadge && eventBadgeText ? eventBadgeText : 'HASHPASS';
  const brandBadgeColor = event?.branding?.primaryColor || '#007AFF';
  const drawerTaglineWords = React.useMemo(
    () => t({
      id: 'index.taglineFlipList',
      message: '- YOUR EVENT -,- YOUR COMMUNITY -,- YOUR REWARDS -',
    }).split(',').map((phrase) => phrase.trim()).filter(Boolean),
    [locale],
  );

  // Keep the platform badge as the default, then gently reveal the current
  // event domain when one is active. The event value is data-driven so an
  // organizer can later provide a different domain/badge without changing
  // this shell (for example, #BSL2026).
  React.useEffect(() => {
    if (!eventBadgeText || !animationsEnabled) {
      setShowEventBadge(false);
      return;
    }

    const interval = setInterval(() => {
      RNAnimated.sequence([
        RNAnimated.timing(badgeTransition, { toValue: 0, duration: 220, useNativeDriver: true }),
        RNAnimated.timing(badgeTransition, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();
      setShowEventBadge((visible) => !visible);
    }, 4200);

    return () => {
      clearInterval(interval);
      badgeTransition.stopAnimation();
      badgeTransition.setValue(1);
    };
  }, [animationsEnabled, badgeTransition, eventBadgeText]);

  const username = React.useMemo(() => {
    const email = typeof user?.email === 'string' ? user.email.trim() : '';
    const localPart = email.split('@')[0]?.trim();
    return localPart ? `@${localPart}` : t({ id: 'nav.account', message: 'Account' });
  }, [user?.email]);
  const memberSince = React.useMemo(() => {
    const createdAt = user?.created_at || user?.date_created;
    if (!createdAt) return null;
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(date);
  }, [locale, user?.created_at, user?.date_created]);

  // Animated fluid gradient effect with multiple layers
  const gradientAnimation1 = useSharedValue(0);
  const gradientAnimation2 = useSharedValue(0);
  const gradientAnimation3 = useSharedValue(0);
  const gradientAnimation4 = useSharedValue(0);

  // Logo zoom animation
  const logoScale = useSharedValue(1);

  // Native explicitly opts OUT of every decorative drawer animation. Users
  // reported the sidebar felt slow to open and close on native, and the
  // biggest avoidable cost during the slide is these UI-thread reanimated
  // animations (the 4 fluid gradient layers below + the logo spring)
  // contending with the drawer's own open/close transition for frame budget.
  // On native we render a clean static header instead — no gradient layers, no
  // withRepeat animations, no logo spring — so the slide has the whole frame
  // budget to itself. The decoration is kept on web, where it's cheap and the
  // slowness was never reported.
  const decorativeAnimationsEnabled = animationsEnabled && Platform.OS === 'web';

  useEffect(() => {
    // The 4 gradient layers only animate while the drawer is open AND only on
    // web (see decorativeAnimationsEnabled above — native drops them entirely).
    if (decorativeAnimationsEnabled && drawerStatus === 'open') {
      // Wait for the open transition to settle before starting the infinite
      // animations, so they never contend with the slide-in for frame budget.
      // The timer is cleared on cleanup (drawer closed, animations toggled off,
      // or unmount) before it can fire.
      const startTimer = setTimeout(() => {
        // Start all animations with different durations for fluid movement
        gradientAnimation1.value = withRepeat(
          withTiming(1, { duration: 4000 }),
          -1,
          true
        );
        gradientAnimation2.value = withRepeat(
          withTiming(1, { duration: 5000 }),
          -1,
          true
        );
        gradientAnimation3.value = withRepeat(
          withTiming(1, { duration: 6000 }),
          -1,
          true
        );
        gradientAnimation4.value = withRepeat(
          withTiming(1, { duration: 3500 }),
          -1,
          true
        );
      }, 350);

      return () => clearTimeout(startTimer);
    }

    // Stop all animations and reset to initial state. Assigning a plain value
    // to a shared value cancels any withRepeat currently running on it.
    gradientAnimation1.value = 0;
    gradientAnimation2.value = 0;
    gradientAnimation3.value = 0;
    gradientAnimation4.value = 0;
  }, [decorativeAnimationsEnabled, drawerStatus]);

  // Animated styles for each gradient layer - only when animations enabled
  const animatedGradientStyle1 = useAnimatedStyle(() => {
    if (!animationsEnabled) {
      return {
        transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }],
        opacity: 0.3,
      };
    }
    const translateX = interpolate(gradientAnimation1.value, [0, 1], [-80, 80]);
    const translateY = interpolate(gradientAnimation1.value, [0, 1], [-50, 50]);
    const scale = interpolate(gradientAnimation1.value, [0, 0.5, 1], [0.7, 1.3, 0.7]);
    return {
      transform: [{ translateX }, { translateY }, { scale }],
      opacity: interpolate(gradientAnimation1.value, [0, 0.5, 1], [0.3, 0.5, 0.3]),
    };
  });

  const animatedGradientStyle2 = useAnimatedStyle(() => {
    if (!animationsEnabled) {
      return {
        transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }],
        opacity: 0.25,
      };
    }
    const translateX = interpolate(gradientAnimation2.value, [0, 1], [80, -80]);
    const translateY = interpolate(gradientAnimation2.value, [0, 1], [50, -50]);
    const scale = interpolate(gradientAnimation2.value, [0, 0.5, 1], [1.0, 0.8, 1.0]);
    return {
      transform: [{ translateX }, { translateY }, { scale }],
      opacity: interpolate(gradientAnimation2.value, [0, 0.5, 1], [0.25, 0.45, 0.25]),
    };
  });

  const animatedGradientStyle3 = useAnimatedStyle(() => {
    if (!animationsEnabled) {
      return {
        transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }],
        opacity: 0.2,
      };
    }
    const translateX = interpolate(gradientAnimation3.value, [0, 1], [-60, 60]);
    const translateY = interpolate(gradientAnimation3.value, [0, 1], [-80, 80]);
    const scale = interpolate(gradientAnimation3.value, [0, 0.5, 1], [0.8, 1.2, 0.8]);
    return {
      transform: [{ translateX }, { translateY }, { scale }],
      opacity: interpolate(gradientAnimation3.value, [0, 0.5, 1], [0.2, 0.4, 0.2]),
    };
  });

  const animatedGradientStyle4 = useAnimatedStyle(() => {
    if (!animationsEnabled) {
      return {
        transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }],
        opacity: 0.15,
      };
    }
    const translateX = interpolate(gradientAnimation4.value, [0, 1], [60, -60]);
    const translateY = interpolate(gradientAnimation4.value, [0, 1], [80, -80]);
    const scale = interpolate(gradientAnimation4.value, [0, 0.5, 1], [1.2, 0.7, 1.2]);
    return {
      transform: [{ translateX }, { translateY }, { scale }],
      opacity: interpolate(gradientAnimation4.value, [0, 0.5, 1], [0.15, 0.35, 0.15]),
    };
  });

  // Check admin status on mount. A user can also have access as an
  // event-scoped event_admin/moderator (event_roles) without ever being a
  // global admin (user_roles) — the sidebar entry must reflect that too, or
  // an event-scoped admin has no visible way into the Admin Panel even
  // though the panel itself already supports them (see admin.tsx).
  //
  // dbUserId is in the dependency array deliberately. The shared identity
  // resolver accepts a verified Better Auth cookie while the Supabase bridge
  // is still in flight, then this effect refreshes the result after the real
  // Supabase identity arrives. That keeps a delayed bridge from leaving the
  // sidebar with a stale non-admin result for the rest of the session.
  React.useEffect(() => {
    let cancelled = false;

    const checkAdminStatus = async () => {
      if (!canLoadCurrentAdminAccess(user, authLoading)) {
        if (!authLoading && !cancelled) setIsUserAdmin(false);
        return;
      }

      try {
        const access = await getCurrentAdminAccess();
        if (!cancelled) {
          setIsUserAdmin(access.effectiveRole.role !== 'user');
        }
      } catch (error) {
        console.error('Unable to load admin access for drawer:', error);
        if (!cancelled) setIsUserAdmin(false);
      }
    };

    checkAdminStatus();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, dbUserId]);

  const baseMenuItems = [
    {
      id: 'nav.explore',
      message: 'Explore',
      icon: 'compass-outline',
      route: './explore' as const,
      tone: '#00A9E0',
    },
    {
      id: 'nav.wallet',
      message: 'Wallet',
      icon: 'wallet-outline',
      route: './wallet' as const,
      tone: '#3B82F6',
    },
    {
      id: 'nav.notifications',
      message: 'Notifications',
      icon: 'notifications-outline',
      route: './notifications' as const,
      tone: '#F59E0B',
    },
    {
      id: 'nav.profile',
      message: 'Profile',
      icon: 'person-outline',
      route: './profile' as const,
      tone: '#8B5CF6',
    },
    {
      id: 'nav.settings',
      message: 'Settings',
      icon: 'settings-outline',
      route: './settings' as const,
      tone: '#64748B',
    },
  ] as const;

  // Add admin menu item if user is admin
  const adminMenuItem = isUserAdmin
    ? [{
      id: 'nav.admin',
      message: 'Admin Panel',
      icon: 'shield-checkmark-outline',
      route: './admin' as const,
      tone: '#10B981',
    }]
    : [];

  const menuItems = [...baseMenuItems, ...adminMenuItem] as const;

  const getLabel = (id: typeof menuItems[number]['id']) => {
    switch (id) {
      case 'nav.explore':
        return t({ id: 'nav.explore', message: 'Explore' });
      case 'nav.wallet':
        return t({ id: 'nav.wallet', message: 'Wallet' });
      case 'nav.notifications':
        return t({ id: 'nav.notifications', message: 'Notifications' });
      case 'nav.profile':
        return t({ id: 'nav.profile', message: 'Profile' });
      case 'nav.settings':
        return t({ id: 'nav.settings', message: 'Settings' });
      case 'nav.admin':
        return t({ id: 'nav.admin', message: 'Admin Panel' });
      default:
        return '';
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
  };

  const handleNavigation = (route: typeof menuItems[number]['route']) => {
    hapticLight();
    // Safety check: ensure route is defined
    if (!route || typeof route !== 'string') {
      console.warn('Invalid route provided to handleNavigation:', route);
      return;
    }

    // Only navigate if we're not already on this screen
    const currentPath = pathname || '';
    const isActive = route.startsWith('./')
      ? currentPath === route || currentPath.endsWith(route.replace('./', ''))
      : currentPath.startsWith(route);

    if (!isActive) {
      // Navigate via the Drawer navigator using the unambiguous screen name
      // ('wallet', 'profile', ...) — NOT router.push('./wallet'). The relative
      // href resolved inconsistently from the drawer content's route context
      // and was frequently a silent no-op: the tab behind never changed and,
      // because pathname never updated, the auto-collapse effect above never
      // fired either (verified live via logcat — handleNavigation ran, but no
      // pathname change followed). A direct navigator navigate by screen name
      // is deterministic and keeps expo-router's pathname in sync.
      const screenName = route.replace('./', '');
      try {
        navigation.navigate(screenName);
      } catch (navError) {
        console.error('Error navigating from drawer:', navError);
      }
    }

    // Collapse the drawer on the next frame. navigation.navigate() is
    // synchronous (unlike the previous async router.push), so by the time this
    // rAF callback runs the navigation state is already applied and this
    // closeDrawer() is the final word — it sticks. Runs for the active-tab
    // (re-tap) case too, where no navigation happens but the sidebar should
    // still close.
    requestAnimationFrame(() => {
      closeDrawer();
    });
  };

  const handleLogout = async () => {
    if (isSigningOut) {
      return;
    }

    hapticMedium();
    setIsSigningOut(true);
    closeDrawer();

    // signOut() synchronously publishes SIGNED_OUT before its first await, so
    // every auth guard sees the logged-out state right away. Do not make this
    // route change wait for SecureStore/AsyncStorage cleanup: either store can
    // be slow or hang after the session was already removed from app state,
    // which used to leave the user looking at a live dashboard until a refresh.
    // The hook continues clearing persistent/native/provider sessions in the
    // background and logs any cleanup failure without restoring the session.
    void signOut({ waitForRemoteCleanup: false }).catch((error: unknown) => {
      console.error('Error signing out:', error);
    });
    router.replace('/(shared)/auth' as any);
  };

  const handleLanguageToggle = async () => {
    hapticLight();
    const locales = ['en', 'es', 'ko'];
    const currentIndex = locales.indexOf(locale);
    const nextIndex = (currentIndex + 1) % locales.length;
    await setLocale(locales[nextIndex]);
  };

  const getLanguageFlag = (locale: string) => {
    switch (locale) {
      case 'en': return '🇺🇸';
      case 'es': return '🇪🇸';
      case 'ko': return '🇰🇷';
      default: return '🇺🇸';
    }
  };

  // Logo zoom animation style
  const logoAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: logoScale.value }],
    };
  });

  const handleLogoPress = () => {
    navigateDashboardBrandToLanding({
      navigation,
      router,
      closeDrawerAction: DrawerActions.closeDrawer(),
    });
  };

  const handleLogoPressIn = () => {
    // Web only — native opts out of all decorative drawer animation (see
    // decorativeAnimationsEnabled). logoScale stays 1, so the logo is static.
    if (Platform.OS !== 'web') return;
    logoScale.value = withSpring(1.1, {
      damping: 10,
      stiffness: 300,
    });
  };

  const handleLogoPressOut = () => {
    if (Platform.OS !== 'web') return;
    logoScale.value = withSpring(1, {
      damping: 10,
      stiffness: 300,
    });
  };

  const handleLogoHoverIn = () => {
    if (Platform.OS === 'web') {
      logoScale.value = withSpring(1.1, {
        damping: 10,
        stiffness: 300,
      });
    }
  };

  const handleLogoHoverOut = () => {
    if (Platform.OS === 'web') {
      logoScale.value = withSpring(1, {
        damping: 10,
        stiffness: 300,
      });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default, flex: 1 }]}>
      {/* Drawer Header */}
      <View style={[styles.drawerHeader, {
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : colors.background.paper,
        borderTopWidth: 4,
        borderTopColor: brandBadgeColor,
        borderBottomWidth: 1,
        borderBottomColor: colors.divider,
        boxShadow: isDark
          ? '0 3px 12px rgba(0, 0, 0, 0.24)'
          : '0 3px 12px rgba(15, 23, 42, 0.12)',
      }]}>
        {/* Animated Fluid Gradient Background Layers — web only; native drops
            them entirely so the drawer slide keeps the whole frame budget. */}
        {decorativeAnimationsEnabled ? (
          <>
            <Animated.View
              style={[
                styles.fluidGradientLayer,
                {
                  backgroundColor: isDark
                    ? 'rgba(175, 13, 1, 0.14)'
                    : 'rgba(30, 58, 138, 0.08)',
                },
                animatedGradientStyle1
              ]}
            />
            <Animated.View
              style={[
                styles.fluidGradientLayer,
                {
                  backgroundColor: isDark
                    ? 'rgba(161, 209, 214, 0.10)'
                    : 'rgba(0, 122, 255, 0.06)',
                },
                animatedGradientStyle2
              ]}
            />
            <Animated.View
              style={[
                styles.fluidGradientLayer,
                {
                  backgroundColor: isDark
                    ? 'rgba(255, 215, 0, 0.08)'
                    : 'rgba(100, 181, 246, 0.05)',
                },
                animatedGradientStyle3
              ]}
            />
            <Animated.View
              style={[
                styles.fluidGradientLayer,
                {
                  backgroundColor: isDark
                    ? 'rgba(255, 87, 34, 0.06)'
                    : 'rgba(63, 81, 181, 0.04)',
                },
                animatedGradientStyle4
              ]}
            />
          </>
        ) : null}
        <View style={[styles.brandingContainer, { zIndex: 1, position: 'relative' }]}>
          <TouchableOpacity
            onPress={handleLogoPress}
            onPressIn={handleLogoPressIn}
            onPressOut={handleLogoPressOut}
            style={styles.logoCardButton}
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel={t({ id: 'nav.backToLanding', message: 'Back to landing' })}
            // @ts-ignore - Web-specific hover handlers
            onMouseEnter={handleLogoHoverIn}
            onMouseLeave={handleLogoHoverOut}
          >
            <Animated.View style={[
              styles.logoPill,
              {
                backgroundColor: isDark ? colors.primaryLight : colors.primaryDark,
                borderColor: colors.primaryContrastText + '66',
                zIndex: 10,
              },
              logoAnimatedStyle,
            ]}>
              <Image
                source={isDark
                  ? require('../../../assets/logos/hashpass/logo-full-hashpass-white-cyan.webp')
                  : require('../../../assets/logos/hashpass/logo-full-hashpass-white.webp')
                }
                style={styles.logoImage}
                resizeMode="contain"
              />
              <View style={styles.logoCardMeta}>
                <Text style={styles.brandSubtitle} numberOfLines={2}>
                  {t({ id: 'nav.brandSubtitle', message: 'Digital Event Platform' })}
                </Text>
                <View style={styles.brandTaglineContainer} pointerEvents="none">
                  {animationsEnabled ? (
                    <FlipWords
                      words={drawerTaglineWords}
                      duration={3000}
                      textStyle={styles.brandTaglineAnimated}
                    />
                  ) : (
                    <Text style={styles.brandTaglineStatic} numberOfLines={1}>
                      {drawerTaglineWords[0]}
                    </Text>
                  )}
                </View>
              </View>
            </Animated.View>
          </TouchableOpacity>
          <View style={styles.identityMeta}>
            <TouchableOpacity
              onPress={() => handleNavigation('./profile')}
              style={styles.brandUsernameButton}
              activeOpacity={0.7}
              accessibilityRole="link"
              accessibilityLabel={`${username}: ${t({ id: 'nav.profile', message: 'Profile' })}`}
            >
              <Text style={styles.brandUsername} numberOfLines={1}>{username}</Text>
            </TouchableOpacity>
            <Text style={styles.brandMemberSince} numberOfLines={1}>
              {t({ id: 'nav.memberSince', message: 'Member since' })} {memberSince || '—'}
            </Text>
            <RNAnimated.View
              style={[styles.identityBadgeWrap, { opacity: badgeTransition }]}
            >
              <View style={[styles.brandBadge, { backgroundColor: brandBadgeColor }]}>
                <Text style={styles.brandBadgeText} numberOfLines={1}>{brandBadgeText}</Text>
              </View>
            </RNAnimated.View>
          </View>
        </View>
        <TouchableOpacity
          onPress={closeDrawer}
          style={styles.drawerCloseButton}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={t({ id: 'nav.closeMenu', message: 'Close navigation menu' })}
        >
          <Ionicons name="close" size={24} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      {/* Menu Items - Scrollable on mobile */}
      <ScrollView
        style={styles.menuItemsScrollView}
        contentContainerStyle={styles.menuItemsContent}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
        bounces={true}
      >
        {menuItems.map((item, index) => {
          // Safety check: ensure route exists
          if (!item.route || typeof item.route !== 'string') {
            console.warn('Menu item has invalid route:', item);
            return null;
          }

          // Check if current path matches the route (handle both relative and absolute routes)
          const isActive = item.route.startsWith('./')
            ? pathname === item.route
            : pathname.startsWith(item.route);
          const stepOrder = index + 2; // Start from 2 (after menu button)
          const stepNames: Record<string, string> = {
            './explore': 'sidebarExplore',
            './wallet': 'sidebarWallet',
            './notifications': 'sidebarNotifications',
            './profile': 'sidebarProfile',
            './settings': 'sidebarSettings',
            './admin': 'sidebarAdmin',
          };
          const stepTexts: Record<string, string> = {
            './explore': 'Explore: Browse events, view your passes, and access quick links to speakers, agenda, and networking. Tap to continue.',
            './wallet': 'Wallet: View and manage your digital passes and tickets for events. Tap to continue.',
            './notifications': 'Notifications: Check your meeting requests, updates, and important alerts. The badge shows unread count. Tap to continue.',
            './profile': 'Profile: View and edit your profile information and account settings. Tap to continue.',
            './settings': 'Settings: Customize app preferences, theme, language, and tutorials. Tap to finish sidebar tour.',
            './admin': 'Admin Panel: Manage passes, scan QR codes, and create meeting matches. Admin access only.',
          };
          return (
            <CopilotStep
              key={item.route as string}
              text={stepTexts[item.route] || `Navigate to ${getLabel(item.id)}`}
              order={stepOrder}
              name={stepNames[item.route] || `sidebar${item.id}`}
            >
              <CopilotTouchableOpacity
                style={[
                  styles.menuItem,
                  {
                    boxShadow: isActive
                      ? (isDark
                        ? '0 10px 24px rgba(0, 0, 0, 0.24)'
                        : '0 10px 24px rgba(15, 23, 42, 0.12)')
                      : (isDark
                        ? '0 6px 16px rgba(0, 0, 0, 0.18)'
                        : '0 6px 16px rgba(15, 23, 42, 0.08)'),
                    backgroundColor: isActive
                      ? (isDark
                        ? `${item.tone}1F`
                        : `${item.tone}14`)
                      : (isDark
                        ? 'rgba(255, 255, 255, 0.05)'
                        : 'rgba(0, 0, 0, 0.03)'), // Subtle background
                    borderLeftWidth: isActive ? 4 : 0,
                    borderLeftColor: isActive ? item.tone : 'transparent',
                    borderColor: isActive ? `${item.tone}55` : colors.divider,
                  }
                ]}
                onPress={() => {
                  // Navigate to the actual view first
                  handleNavigation(item.route);

                  // Continue to next tutorial step after a short delay
                  const nextStep = stepOrder + 1;
                  setTimeout(() => {
                    if (copilotHook?.handleNext && typeof copilotHook.handleNext === 'function') {
                      copilotHook.handleNext();
                    } else if (copilotHook?.handleNth && typeof copilotHook.handleNth === 'function') {
                      copilotHook.handleNth(nextStep);
                    }

                    // If this is the last sidebar item (Settings), close drawer after tutorial moves
                    // This ensures main content steps (Your Passes, Quick Access, etc.) are visible
                    if (index === menuItems.length - 1) {
                      setTimeout(() => {
                        setDrawerOpen(false);
                      }, 500); // Wait for tutorial to move to next step (order 8)
                    }
                  }, 300); // Small delay to allow navigation to complete
                }}
                activeOpacity={0.6}
              >
                <View style={[
                  styles.menuIconContainer,
                  {
                    backgroundColor: isActive
                      ? item.tone
                      : (isDark
                        ? 'rgba(255, 255, 255, 0.08)'
                        : 'rgba(0, 0, 0, 0.05)'),
                  }
                ]}>
                  <Ionicons
                    name={item.icon as any}
                    size={20}
                    color={isActive ? '#FFFFFF' : colors.text.secondary}
                  />
                </View>
                <Text
                  style={[
                    styles.menuText,
                    {
                      color: isActive ? colors.text.primary : colors.text.secondary,
                      fontWeight: isActive ? '600' : '500',
                      fontSize: 16,
                    }
                  ]}
                >
                  {getLabel(item.id)}
                </Text>
                {item.route === './notifications' && unreadCount > 0 && (
                  <View style={styles.menuBadge}>
                    <Text style={styles.menuBadgeText}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Text>
                  </View>
                )}
                {isActive && (
                  <View style={[styles.activeIndicator, { backgroundColor: item.tone }]} />
                )}
              </CopilotTouchableOpacity>
            </CopilotStep>
          );
        })}
      </ScrollView>

      {/* Quick Settings & Actions */}
      <View style={styles.quickSettingsSection}>
        <Text style={styles.quickSettingsTitle}>{t({ id: 'nav.quickActions', message: 'Quick actions' })}</Text>
        <View style={styles.quickTogglesRow}>
          {/* Language Toggle */}
          <TouchableOpacity
            style={styles.quickToggleButton}
            onPress={handleLanguageToggle}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${t({ id: 'nav.language', message: 'Language' })}: ${locale.toUpperCase()}`}
          >
            <View style={styles.quickToggleIcon}>
              <Text style={styles.languageFlag}>{getLanguageFlag(locale)}</Text>
            </View>
            {!compactQuickActions && (
              <Text style={styles.quickToggleLabel} numberOfLines={1}>
                {locale.toUpperCase()}
              </Text>
            )}
          </TouchableOpacity>

          {/* Theme Toggle */}
          <TouchableOpacity
            style={styles.quickToggleButton}
            onPress={() => { hapticLight(); toggleTheme(); }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={isDark
              ? t({ id: 'nav.light', message: 'Light' })
              : t({ id: 'nav.dark', message: 'Dark' })}
          >
            <View style={[styles.quickToggleIcon, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(175, 13, 1, 0.10)' }]}>
              <Ionicons
                name={isDark ? 'sunny' : 'moon'}
                size={20}
                color={isDark ? '#FFFFFF' : colors.primary}
              />
            </View>
            {!compactQuickActions && (
              <Text style={styles.quickToggleLabel} numberOfLines={1}>
                {isDark ? t({ id: 'nav.light', message: 'Light' }) : t({ id: 'nav.dark', message: 'Dark' })}
              </Text>
            )}
          </TouchableOpacity>

          {/* Logout Button */}
          <TouchableOpacity
            style={[
              styles.quickToggleButton,
              isSigningOut && styles.quickToggleButtonDisabled,
            ]}
            onPress={handleLogout}
            disabled={isSigningOut}
            activeOpacity={isSigningOut ? 1 : 0.7}
            accessibilityRole="button"
            accessibilityLabel={t({ id: 'nav.logout', message: 'Logout' })}
            accessibilityState={{ busy: isSigningOut, disabled: isSigningOut }}
          >
            <View style={[styles.quickToggleIcon, { backgroundColor: 'rgba(255, 59, 48, 0.12)' }]}>
              {isSigningOut ? (
                <ActivityIndicator size="small" color={colors.error.main} />
              ) : (
                <Ionicons
                  name="log-out-outline"
                  size={20}
                  color={colors.error.main}
                />
              )}
            </View>
            {!compactQuickActions && (
              <Text style={[styles.quickToggleLabel, { color: colors.error.main }]} numberOfLines={1}>
                {t({ id: 'nav.logout', message: 'Logout' })}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Version Display */}
      <VersionDisplay showInSidebar={true} bottomInset={drawerSafeInsets.bottom} />
    </View>
  );
}

// Main Dashboard Layout
export default function DashboardLayout() {
  const { colors, isDark } = useTheme();
  const isMobile = useIsMobile();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth } = useWindowDimensions();
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const styles = useMemo(
    () => getStyles(isDark, colors, isMobile, insets),
    [colors, insets, isDark, isMobile],
  );
  // Native mobile intentionally stops short of the full viewport width
  // (previously Math.ceil(viewportWidth), i.e. 100%): with no visible gap on
  // the right, there is no dimmed backdrop left for the drawer's own
  // tap-outside-to-close Pressable to sit on top of, so — even though the
  // close handlers themselves are fine — there is no "outside" a user can
  // tap to trigger them. Computing a live pixel value (not a '%' string)
  // keeps this in sync with useWindowDimensions() on rotation/resize the
  // same way the previous full-width value did.
  //
  // Memoized (both the number AND the `{ width }` wrapper object below): the
  // open/close transition felt like it needed two taps to actually reach
  // 80%/0% — the drawer would settle at some intermediate width on the first
  // tap. `drawerStyle` was previously a brand-new object literal built inline
  // inside the unmemoized `screenOptions` callback below, so it got a new
  // identity on EVERY DashboardLayout re-render — including the several that
  // happen while the drawer is mid-open/close (scroll updates, notification
  // polling, animation ticks). React Navigation's Drawer derives its
  // open/close animation target from `options.drawerStyle`, so a reference
  // change mid-transition could re-target the in-flight animation using a
  // still-transitioning current position, which reads exactly as "stops
  // partway, needs a second tap to finish." A stable `dashboardDrawerWidth` +
  // `drawerStyle` reference removes that as a possible cause.
  const dashboardDrawerWidth = useMemo<DimensionValue>(
    () =>
      Platform.OS !== 'web' && isMobile
        ? Math.ceil(viewportWidth * 0.8)
        : isMobile
          ? '88%'
          : 360,
    [isMobile, viewportWidth],
  );
  const dashboardDrawerStyle = useMemo(
    () => ({ width: dashboardDrawerWidth }),
    [dashboardDrawerWidth],
  );
  // Instance-scoped bridge from CustomDrawerContent's navigation object to
  // Header (see the DrawerNavRef comment above CustomDrawerContent).
  const drawerNavRef = useRef<DrawerNavigation | null>(null);
  // Drawer open/closed is tracked in a REF, not useState, on purpose: it's only
  // ever read (never rendered) — the two copilot `wasOpen` checks below — so
  // making it reactive state bought nothing but a full DashboardLayout
  // re-render (which re-runs the inline `screenOptions` and the Header) on
  // every single open and close, right in the middle of the drawer slide. That
  // JS work competing with the UI-thread slide is part of why the sidebar felt
  // slow. A ref updates without re-rendering, so the slide runs undisturbed.
  const drawerOpenRef = useRef(false);
  const handleDrawerStatusChange = useCallback((isOpen: boolean) => {
    drawerOpenRef.current = isOpen;
  }, []);
  // See the DrawerOpenControlRef comment above CustomDrawerContent. Populated
  // by the patched DrawerView; a plain ref so wiring it up doesn't cascade a
  // DashboardLayout re-render, for the same reason as drawerOpenRef above.
  const drawerOpenControlRef: DrawerOpenControlRef = useRef(null);
  const [androidQrScannerVisible, setAndroidQrScannerVisible] = useState(false);
  const dashboardCopilotHook = useCopilot() as any;
  // Memoized so drawerContent keeps a stable identity across DashboardLayout
  // re-renders (scroll, notifications, animation state all cause those). An
  // inline arrow function here would make react-navigation's Drawer treat
  // drawerContent as a new component on every render, unmounting/remounting
  // CustomDrawerContent — the actual gesture-handled, animated native drawer
  // view — repeatedly. Tearing down a view with live gesture-handler /
  // reanimated bindings mid-flight is a known native-crash trigger, and
  // exactly the failure shape behind this file's prior react-native-screens
  // incidents. drawerNavRef and handleDrawerStatusChange are both stable
  // references across renders (a ref object and a useCallback), so it's safe to
  // close over both without listing them as dependencies.
  const renderDrawerContent = useCallback(
    (props: object) => (
      <CustomDrawerContent
        {...props}
        navRef={drawerNavRef}
        onDrawerStatusChange={handleDrawerStatusChange}
        openCloseControlRef={drawerOpenControlRef}
      />
    ),
    [],
  );

  // Latest auth state for the delayed redirect below — the timeout must
  // re-check the CURRENT values when it fires, not the ones captured when it
  // was scheduled.
  const isLoggedInRef = React.useRef(isLoggedIn);
  const authLoadingRef = React.useRef(authLoading);
  React.useEffect(() => {
    isLoggedInRef.current = isLoggedIn;
    authLoadingRef.current = authLoading;
  });

  // Verify user is logged in before allowing dashboard access (provider-agnostic)
  React.useEffect(() => {
    if (isDevAuthBypassEnabled()) return;
    if (authLoading || isLoggedIn) return;

    if (hasRecentAuthSuccess()) {
      authService.getSession().catch(() => {});
      return;
    }

    // A transient provider flap (one failed native Better Auth getSession)
    // can drop isLoggedIn for a beat while the user still holds a valid
    // session. Redirecting instantly force-unmounts the dashboard mid-render
    // — the exact window where Fabric crashes natively on Android — so only
    // eject when the signed-out state actually persists.
    const redirectTimer = setTimeout(() => {
      if (authLoadingRef.current || isLoggedInRef.current) return;
      console.warn('⚠️ Not authenticated in dashboard, redirecting to auth');
      router.replace('/(shared)/auth' as any);
    }, 2500);

    return () => clearTimeout(redirectTimer);
  }, [authLoading, isLoggedIn, router]);

  const openDashboardDrawer = useCallback((navigation: DrawerNavigation) => {
    const wasOpen = drawerOpenRef.current;

    // Primary path: the imperative ref into the patched DrawerView's own
    // state (see DrawerOpenControlRef comment above). Fall back to the old
    // dispatch-based path only on the first render, before the patched
    // DrawerView's effect has populated the ref.
    if (drawerOpenControlRef.current?.setOpen) {
      drawerOpenControlRef.current.setOpen(true);
    } else {
      const opened = openTargetedDashboardDrawer({
        navigation,
        drawerNavigation: drawerNavRef.current,
        openDrawerAction: DrawerActions.openDrawer(),
      });

      if (!opened) {
        console.warn('Drawer navigation unavailable, skipping openDrawer');
        return;
      }
    }

    // React Navigation owns its animation lifecycle. In particular, do not
    // lock this handler before the action is processed: on production Android
    // that local lock could outlive an ignored action and make every future
    // hamburger press a no-op (v1.8.258).
    if (wasOpen) {
      return;
    }

    setTimeout(() => {
      if (dashboardCopilotHook?.handleNth && typeof dashboardCopilotHook.handleNth === 'function') {
        dashboardCopilotHook.handleNth(2);
      } else if (dashboardCopilotHook?.handleNext && typeof dashboardCopilotHook.handleNext === 'function') {
        dashboardCopilotHook.handleNext();
      } else {
        console.warn('No handleNext or handleNth available', dashboardCopilotHook);
      }
    }, 1200);
  }, [dashboardCopilotHook]);

  const openDashboardDrawerFromHeader = useCallback((navigation: DrawerNavigation) => {
    openDashboardDrawer(navigation);
  }, [openDashboardDrawer]);

  // Header component for the drawer screens
  const Header = () => {
    // Always call the hook (Rules of Hooks), but keep the drawerContent-provided
    // ref as a fallback. It is written from inside the Drawer's actual
    // navigation context, which avoids dispatching drawer actions to a parent
    // Stack navigator during transition edges.
    const navigationFromContext = useNavigation<DrawerNavigation>();
    const headerRouter = useRouter();
    const { headerOpacity, headerBackground, headerTint, headerBlur, headerBorderWidth, headerHeight, setHeaderHeight, scrollY } = useScroll();
    const { animationsEnabled } = useAnimations();
    const copilotHook = useCopilot() as any;
    const handleNext = copilotHook?.handleNext || copilotHook?.handleNth;
    const [qrScannerVisible, setQrScannerVisible] = React.useState(false);

    React.useEffect(() => {
      if (Platform.OS === 'android') {
        setHeaderHeight(ANDROID_DASHBOARD_HEADER_HEIGHT);
      }
    }, [setHeaderHeight]);

    // Adjust header background color based on theme to match app background
    const HEADER_SCROLL_DISTANCE = 100;
    // Extract RGB values from theme background color
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 18, g: 18, b: 18 }; // Fallback to dark color
    };
    const bgRgb = hexToRgb(colors.background.default);

    // Banner colors - typically blue (#007AFF) or event-specific colors
    // When banner is visible, blend with banner color
    const bannerColor = '#007AFF'; // Default banner color
    const bannerRgb = hexToRgb(bannerColor);

    // Interpolate RGB values based on scroll to blend theme color with banner color
    // Only interpolate when animations are enabled
    const blendedR = animationsEnabled ? scrollY.interpolate({
      inputRange: [0, HEADER_SCROLL_DISTANCE * 0.5, HEADER_SCROLL_DISTANCE],
      outputRange: [bgRgb.r, Math.round((bgRgb.r + bannerRgb.r) / 2), bannerRgb.r],
      extrapolate: 'clamp',
    }) : bgRgb.r;

    const blendedG = animationsEnabled ? scrollY.interpolate({
      inputRange: [0, HEADER_SCROLL_DISTANCE * 0.5, HEADER_SCROLL_DISTANCE],
      outputRange: [bgRgb.g, Math.round((bgRgb.g + bannerRgb.g) / 2), bannerRgb.g],
      extrapolate: 'clamp',
    }) : bgRgb.g;

    const blendedB = animationsEnabled ? scrollY.interpolate({
      inputRange: [0, HEADER_SCROLL_DISTANCE * 0.5, HEADER_SCROLL_DISTANCE],
      outputRange: [bgRgb.b, Math.round((bgRgb.b + bannerRgb.b) / 2), bannerRgb.b],
      extrapolate: 'clamp',
    }) : bgRgb.b;

    // Build rgba string dynamically with smooth color transitions.
    // Alpha is kept at 0.95 throughout so scrollable content is never visible
    // behind the header. BlurView underneath still shows through the 5% gap.
    // If animations disabled, use solid color.
    const adjustedHeaderBackground = animationsEnabled
      ? scrollY.interpolate({
        inputRange: [
          0,
          HEADER_SCROLL_DISTANCE * 0.3,
          HEADER_SCROLL_DISTANCE * 0.6,
          HEADER_SCROLL_DISTANCE
        ],
        outputRange: [
          `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, 0.95)`,
          `rgba(${Math.round(bgRgb.r * 0.7 + bannerRgb.r * 0.3)}, ${Math.round(bgRgb.g * 0.7 + bannerRgb.g * 0.3)}, ${Math.round(bgRgb.b * 0.7 + bannerRgb.b * 0.3)}, 0.95)`,
          `rgba(${Math.round(bgRgb.r * 0.3 + bannerRgb.r * 0.7)}, ${Math.round(bgRgb.g * 0.3 + bannerRgb.g * 0.7)}, ${Math.round(bgRgb.b * 0.3 + bannerRgb.b * 0.7)}, 0.95)`,
          `rgba(${bannerRgb.r}, ${bannerRgb.g}, ${bannerRgb.b}, 0.95)`,
        ],
        extrapolate: 'clamp',
      })
      : colors.background.default; // Solid color when animations disabled

    // Gloss effect animation based on scroll - disabled when animations off
    const glossOpacity = animationsEnabled
      ? scrollY.interpolate({
        inputRange: [0, HEADER_SCROLL_DISTANCE * 0.5, HEADER_SCROLL_DISTANCE],
        outputRange: [0, 0.4, 0.6], // More visible when scrolled
        extrapolate: 'clamp',
      })
      : 0; // No gloss when animations disabled

    const glossPosition = animationsEnabled
      ? scrollY.interpolate({
        inputRange: [0, HEADER_SCROLL_DISTANCE],
        outputRange: [-200, 200], // Moves from left to right as you scroll
        extrapolate: 'clamp',
      })
      : 0; // No movement when animations disabled

    // Blur intensity based on scroll - use headerBlur from context
    const blurIntensityValue = headerBlur;

    // Use regular View for styles that come from old Animated API
    // Animated.View from reanimated doesn't support old Animated.Interpolation directly
    return (
      <RNAnimated.View
        pointerEvents="auto"
        style={[
          styles.header,
          Platform.OS !== 'web' && {
            backgroundColor: adjustedHeaderBackground as any,
          },
          {
            borderBottomWidth: headerBorderWidth,
            borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
            boxShadow: isDark
              ? '0 3px 6px rgba(0, 0, 0, 0.36)'
              : '0 3px 6px rgba(15, 23, 42, 0.18)',
            overflow: 'hidden',
          }
        ]}
        onLayout={
          Platform.OS === 'android'
            ? undefined
            : (e) => setHeaderHeight(e.nativeEvent.layout.height)
        }
      >
        {/* Background with blur and gloss effect */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Blur effect - only when animations enabled */}
          {animationsEnabled ? (
            Platform.OS === 'web' ? (
              <RNAnimated.View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    backgroundColor: adjustedHeaderBackground as any,
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                  }
                ]}
              />
            ) : (
              <>
                <SafeBlurView
                  intensity={20}
                  tint={isDark ? 'dark' : 'light'}
                  style={StyleSheet.absoluteFill}
                />
                <RNAnimated.View
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      backgroundColor: adjustedHeaderBackground as any,
                    }
                  ]}
                />
              </>
            )
          ) : (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: adjustedHeaderBackground as string,
                }
              ]}
            />
          )}

          {/* Gloss effect overlay - only when animations enabled */}
          {animationsEnabled && (
            <RNAnimated.View
              style={[
                StyleSheet.absoluteFill,
                {
                  opacity: glossOpacity as any,
                  transform: [{ translateX: glossPosition as any }],
                }
              ]}
              pointerEvents="none"
            >
              <View
                style={{
                  width: '200%',
                  height: '100%',
                  backgroundColor: 'transparent',
                  flexDirection: 'row',
                }}
              >
                {/* Left transparent */}
                <View style={{ flex: 1, backgroundColor: 'transparent' }} />
                {/* Center gloss highlight */}
                <View
                  style={{
                    width: '50%',
                    height: '100%',
                    backgroundColor: 'rgba(255, 255, 255, 0.4)',
                  }}
                />
                {/* Right transparent */}
                <View style={{ flex: 1, backgroundColor: 'transparent' }} />
              </View>
            </RNAnimated.View>
          )}
        </View>
        <RNAnimated.View
          pointerEvents="auto"
          style={[
            styles.headerContent,
            animationsEnabled ? {
              opacity: headerOpacity.interpolate({
                inputRange: [0, 1],
                outputRange: [0.8, 1],
              }),
            } : {
              opacity: 1,
            },
            {
              pointerEvents: 'auto',
            }
          ]}
        >
          <CopilotStep
            text="Welcome! Tap the menu button (☰) to open the sidebar. You'll see navigation options like Explore, Wallet, Notifications, Profile, and Settings."
            order={1}
            name="menuButton"
          >
            <View style={{ position: 'relative' }}>
              <CopilotTouchableOpacity
                onPress={() => openDashboardDrawerFromHeader(navigationFromContext)}
                style={styles.headerIconButton}
                activeOpacity={0.8}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                // Make sure this is clickable even during tutorial
              >
                <Ionicons
                  name="menu"
                  size={26}
                  color={isDark ? '#FFFFFF' : '#000000'}
                />
              </CopilotTouchableOpacity>
            </View>
          </CopilotStep>

          <View pointerEvents="box-none" style={styles.headerLogoContainer}>
            <TouchableOpacity
              onPress={() => headerRouter.push('./explore' as any)}
              style={styles.headerLogoButton}
              activeOpacity={0.8}
            >
              <Image
                source={isDark
                  ? require('../../../assets/logos/hashpass/logo-full-hashpass-white-cyan.webp')
                  : require('../../../assets/logos/hashpass/logo-full-hashpass-white.webp')
                }
                style={styles.headerLogoImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <CopilotStep text="Tap the notifications icon to view your recent notifications. The red badge shows the number of unread notifications. You can also access the full notifications screen from the sidebar." order={10} name="notificationsButton">
              <CopilotView>
                <MiniNotificationDropdown />
              </CopilotView>
            </CopilotStep>
            <CopilotStep text="Tap the QR code scanner to scan QR codes for event check-ins, networking, or accessing event features." order={11} name="qrScannerButton">
              <CopilotTouchableOpacity
                onPress={() => setQrScannerVisible(true)}
                style={styles.headerIconButton}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="qr-code-outline"
                  size={26}
                  color={isDark ? '#FFFFFF' : '#000000'}
                />
              </CopilotTouchableOpacity>
            </CopilotStep>
          </View>

        </RNAnimated.View>

        {/* Regular QR Scanner Modal */}
        {qrScannerVisible && (
          <QRScanner
            visible
            onClose={() => setQrScannerVisible(false)}
            onScanSuccess={(result: unknown) => {
              setQrScannerVisible(false);
              // You can add navigation or other actions here based on scan result
            }}
            onScanError={(error: unknown) => {
              console.error('QR Scan Error:', error);
              // Error is already shown in the scanner component
            }}
          />
        )}

      </RNAnimated.View>
    );
  };

  // Screen component with header
  const ScreenWithHeader = () => {
    return (
      <View pointerEvents="auto" style={[styles.headerContainer, {
        height: ANDROID_DASHBOARD_HEADER_HEIGHT,
        backgroundColor: isDark ? 'rgba(18, 18, 18, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        zIndex: 1000,
      }]}>
        <SystemBars style={isDark ? 'light' : 'dark'} />
        <Header />
      </View>
    );
  };


  const customDrawerHeaderOptions = {
    headerShown: true,
    header: () => <ScreenWithHeader />,
    headerStyle: { height: ANDROID_DASHBOARD_HEADER_HEIGHT },
  };

  const getDrawerHeaderOptions = (navigation: DrawerNavigation) => {
    if (Platform.OS !== 'android') {
      return customDrawerHeaderOptions;
    }

    return {
      headerShown: true,
      headerTitleAlign: 'center' as const,
      headerTintColor: isDark ? '#FFFFFF' : '#000000',
      headerStyle: {
        height: ANDROID_DASHBOARD_HEADER_HEIGHT,
        backgroundColor: isDark ? 'rgba(18, 18, 18, 0.95)' : 'rgba(255, 255, 255, 0.95)',
      },
      headerShadowVisible: true,
      headerLeftContainerStyle: styles.nativeHeaderLeftContainer,
      headerRightContainerStyle: styles.nativeHeaderRightContainer,
      headerTitle: () => (
        <TouchableOpacity
          onPress={() => router.push('./explore' as any)}
          style={styles.headerLogoButton}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Explore events"
        >
          <Image
            source={isDark
              ? require('../../../assets/logos/hashpass/logo-full-hashpass-white-cyan.webp')
              : require('../../../assets/logos/hashpass/logo-full-hashpass-white.webp')
            }
            style={styles.headerLogoImage}
            resizeMode="contain"
          />
        </TouchableOpacity>
      ),
      headerLeft: () => (
        <CopilotStep
          text="Welcome! Tap the menu button (☰) to open the sidebar. You'll see navigation options like Explore, Wallet, Notifications, Profile, and Settings."
          order={1}
          name="menuButton"
        >
          <CopilotTouchableOpacity
            onPress={() => openDashboardDrawerFromHeader(navigation)}
            style={styles.headerIconButton}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Open navigation menu"
          >
            <Ionicons
              name="menu"
              size={26}
              color={isDark ? '#FFFFFF' : '#000000'}
            />
          </CopilotTouchableOpacity>
        </CopilotStep>
      ),
      headerRight: () => (
        <View style={styles.nativeHeaderRight}>
          <CopilotStep text="Tap the notifications icon to view your recent notifications. The red badge shows the number of unread notifications. You can also access the full notifications screen from the sidebar." order={10} name="notificationsButton">
            <CopilotView style={styles.nativeHeaderActionSlot}>
              <MiniNotificationDropdown />
            </CopilotView>
          </CopilotStep>
          <CopilotStep text="Tap the QR code scanner to scan QR codes for event check-ins, networking, or accessing event features." order={11} name="qrScannerButton">
            <CopilotTouchableOpacity
              onPress={() => setAndroidQrScannerVisible(true)}
              style={styles.headerIconButton}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Open QR scanner"
            >
              <Ionicons
                name="qr-code-outline"
                size={26}
                color={isDark ? '#FFFFFF' : '#000000'}
              />
            </CopilotTouchableOpacity>
          </CopilotStep>
        </View>
      ),
    };
  };

  return (
    <AnimationProvider>
      <NotificationProvider>
        <ScrollProvider>
          <View style={{ flex: 1 }}>
            <Drawer
              openControlRef={drawerOpenControlRef}
              drawerContent={renderDrawerContent}
              screenOptions={({ navigation }) => ({
                ...getDrawerHeaderOptions(navigation),
                drawerType: 'front',
                drawerStyle: dashboardDrawerStyle,
                overlayColor: 'rgba(0,0,0,0.5)',
                drawerPosition: 'left',
                // Native edge swipes can dispatch a second drawer transition
                // while the current slide is settling. Keep the deterministic
                // burger and backdrop close paths on Android/iOS.
                swipeEnabled: Platform.OS === 'web',
              })}
            >
              <Drawer.Screen name="explore" />
              <Drawer.Screen name="notifications" />
              <Drawer.Screen name="wallet" />
              <Drawer.Screen name="profile" />
              <Drawer.Screen name="settings" />
              <Drawer.Screen name="admin" />
              <Drawer.Screen name="qr-view" />
              <Drawer.Screen name="pass-details" />
            </Drawer>
            {Platform.OS === 'android' && (
              <QRScanner
                visible={androidQrScannerVisible}
                onClose={() => setAndroidQrScannerVisible(false)}
                onScanSuccess={(result: unknown) => {
                  setAndroidQrScannerVisible(false);
                }}
                onScanError={(error: unknown) => {
                  console.error('QR Scan Error:', error);
                }}
              />
            )}
          </View>
        </ScrollProvider>
      </NotificationProvider>
    </AnimationProvider>
  );
}

const getStyles = (
  isDark: boolean,
  colors: any,
  isMobile: boolean,
  insets: DashboardDrawerInsets = {},
  compactQuickActions = false,
  compactDrawerBranding = false,
) => {
  const drawerSafeInsets = getDashboardDrawerInsets(insets);
  const brandCardSize = compactDrawerBranding ? 88 : isMobile ? 100 : 108;

  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.default,
  },
  headerContainer: {
    backgroundColor: 'transparent',
    zIndex: 1000,
  },
  header: {
    left: 0,
    right: 0,
    zIndex: 1000,
    height: ANDROID_DASHBOARD_HEADER_HEIGHT,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    height: '100%',
  },
  headerButton: {
    padding: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
    boxShadow: isDark
      ? '0 6px 12px rgba(0, 0, 0, 0.28)'
      : '0 6px 12px rgba(15, 23, 42, 0.12)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)',
  },
  headerIconButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  headerLogoContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // A negative zIndex here previously made the logo invisible on Android
    // (negative zIndex doesn't just sit behind the hamburger/QR buttons the
    // way it does on web — it can drop behind the header's own background on
    // Android's native compositor). pointerEvents: 'box-none' does the actual
    // job negative zIndex was trying to do — letting taps on the empty parts
    // of this full-width overlay fall through to the buttons underneath —
    // without needing to hide the view to get there.
  },
  headerLogoButton: {
    width: 180,
    height: ANDROID_DASHBOARD_HEADER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogoImage: {
    width: 120,
    height: 40,
  },
  nativeHeaderLeftContainer: {
    paddingLeft: 12,
  },
  nativeHeaderRightContainer: {
    paddingRight: 12,
  },
  nativeHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    width: 112,
  },
  nativeHeaderActionSlot: {
    width: 52,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerHeader: {
    paddingTop: (isMobile ? 10 : 14) + drawerSafeInsets.top,
    paddingBottom: isMobile ? 12 : 14,
    paddingLeft: 18 + drawerSafeInsets.left,
    paddingRight: 18 + drawerSafeInsets.right,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : colors.background.paper,
    position: 'relative',
    overflow: 'hidden',
    boxShadow: isDark
      ? '0 3px 12px rgba(0, 0, 0, 0.22)'
      : '0 3px 12px rgba(15, 23, 42, 0.12)',
  },
  gradientBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 0,
  },
  fluidGradientLayer: {
    position: 'absolute',
    width: 400,
    height: 400,
    borderRadius: 200, // Circular shape
    top: '50%',
    left: '50%',
    marginTop: -200,
    marginLeft: -200,
    zIndex: 0,
  },
  brandingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: compactDrawerBranding ? 8 : 12,
  },
  logoCardButton: {
    width: brandCardSize,
    height: brandCardSize,
    flexShrink: 0,
  },
  logoPill: {
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: compactDrawerBranding ? 7 : 8,
    paddingVertical: compactDrawerBranding ? 7 : 8,
    borderRadius: compactDrawerBranding ? 22 : 24,
    borderWidth: 2,
    boxShadow: '0 3px 6px rgba(0, 0, 0, 0.18)',
  },
  logoImage: {
    width: compactDrawerBranding ? 62 : 70,
    height: compactDrawerBranding ? 20 : 23,
  },
  logoCardMeta: {
    width: '100%',
    paddingTop: compactDrawerBranding ? 4 : 5,
    alignItems: 'center',
  },
  identityMeta: {
    flex: 1,
    minWidth: 0,
    // The close button is absolute in the header, so the identity column
    // reserves its 38/42px hit target plus a small gutter. This keeps long
    // usernames visible and prevents the close control from intercepting
    // profile-link taps at the edge of the drawer.
    paddingRight: isMobile ? 46 : 50,
    justifyContent: 'center',
  },
  identityBadgeWrap: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    marginTop: compactDrawerBranding ? 7 : 8,
  },
  drawerCloseButton: {
    position: 'absolute',
    top: (isMobile ? 10 : 14) + drawerSafeInsets.top,
    right: 18 + drawerSafeInsets.right,
    width: isMobile ? 38 : 42,
    height: isMobile ? 38 : 42,
    borderRadius: isMobile ? 19 : 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    borderWidth: 1,
    borderColor: colors.divider,
    zIndex: 2,
  },
  brandTaglineContainer: {
    width: '100%',
    height: compactDrawerBranding ? 12 : 14,
    marginTop: compactDrawerBranding ? 2 : 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandSubtitle: {
    fontSize: compactDrawerBranding ? 5.8 : 6.8,
    fontWeight: '700',
    color: colors.primaryContrastText + 'C7',
    letterSpacing: compactDrawerBranding ? 0.55 : 0.7,
    lineHeight: compactDrawerBranding ? 7 : 8,
    textAlign: 'center',
    textTransform: 'uppercase',
    maxWidth: '100%',
  },
  brandTaglineAnimated: {
    fontSize: compactDrawerBranding ? 4.8 : 5.3,
    fontWeight: '600',
    color: colors.primaryContrastText + 'A3',
    letterSpacing: compactDrawerBranding ? 0.45 : 0.55,
    lineHeight: compactDrawerBranding ? 7 : 8,
    textAlign: 'center',
    textTransform: 'uppercase',
    maxWidth: '100%',
  },
  brandTaglineStatic: {
    fontSize: compactDrawerBranding ? 4.8 : 5.3,
    fontWeight: '600',
    color: colors.primaryContrastText + 'A3',
    letterSpacing: compactDrawerBranding ? 0.45 : 0.55,
    lineHeight: compactDrawerBranding ? 7 : 8,
    textAlign: 'center',
    textTransform: 'uppercase',
    maxWidth: '100%',
  },
  brandBadge: {
    backgroundColor: isDark ? colors.primaryLight : colors.primaryDark,
    borderRadius: 999,
    paddingHorizontal: compactDrawerBranding ? 8 : 10,
    paddingVertical: compactDrawerBranding ? 3 : 4,
    borderWidth: 1,
    borderColor: colors.primaryContrastText + '26',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.14)',
  },
  brandBadgeText: {
    fontSize: compactDrawerBranding ? 9 : 10,
    fontWeight: '800',
    color: colors.primaryContrastText,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  brandUsername: {
    marginTop: 0,
    fontSize: compactDrawerBranding ? 13 : isMobile ? 15 : 16,
    lineHeight: compactDrawerBranding ? 17 : 20,
    fontWeight: '800',
    color: colors.text.primary,
    maxWidth: '100%',
  },
  brandUsernameButton: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  brandMemberSince: {
    marginTop: compactDrawerBranding ? 3 : 4,
    fontSize: compactDrawerBranding ? 8.5 : isMobile ? 9.5 : 10,
    lineHeight: compactDrawerBranding ? 12 : 14,
    fontWeight: '400',
    fontStyle: 'italic',
    letterSpacing: 0.1,
    color: colors.text.secondary,
    maxWidth: '100%',
  },
  drawerHeaderText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.primaryContrastText,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  menuItemsScrollView: {
    flex: 1,
  },
  menuItemsContent: {
    paddingTop: 16,
    paddingBottom: 12,
    paddingStart: (isMobile ? 12 : 10) + drawerSafeInsets.left,
    paddingEnd: (isMobile ? 12 : 10) + drawerSafeInsets.right,
    flexGrow: 1,
  },
  menuItems: {
    flex: 1,
    paddingTop: 24,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: isMobile ? 13 : 12,
    paddingRight: isMobile ? 16 : 14,
    paddingLeft: isMobile ? 16 : 14,
    marginVertical: isMobile ? 6 : 5,
    borderRadius: isMobile ? 18 : 16,
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : colors.background.default,
    position: 'relative',
    overflow: 'visible',
    boxShadow: isDark
      ? '0 4px 12px rgba(0, 0, 0, 0.12)'
      : '0 4px 12px rgba(15, 23, 42, 0.06)',
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: isMobile ? 14 : 12,
  },
  activeIndicator: {
    position: 'absolute',
    right: 12,
    width: 4,
    height: 24,
    borderRadius: 999,
  },
  menuText: {
    fontSize: 15,
    color: colors.text.primary,
    flex: 1,
    letterSpacing: 0.1,
  },
  menuBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 22,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  menuBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    margin: 12,
    gap: 16,
    backgroundColor: isDark ? 'rgba(255, 59, 48, 0.1)' : 'rgba(255, 59, 48, 0.05)',
    borderLeftWidth: 4,
    borderLeftColor: '#FF3B30',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 59, 48, 0.2)' : 'rgba(255, 59, 48, 0.1)',
    boxShadow: isDark
      ? '0 4px 10px rgba(255, 59, 48, 0.14)'
      : '0 4px 10px rgba(255, 59, 48, 0.08)',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.error.main,
    flex: 1,
  },
  quickSettingsSection: {
    paddingHorizontal: compactQuickActions ? 10 : 12,
    paddingVertical: compactQuickActions ? 10 : 12,
    marginStart: (isMobile ? 20 : 16) + drawerSafeInsets.left,
    marginEnd: (isMobile ? 18 : 16) + drawerSafeInsets.right,
    marginTop: 10,
    marginBottom: 6,
    borderRadius: 18,
    backgroundColor: isDark
      ? 'rgba(255, 255, 255, 0.04)'
      : colors.background.paper,
    borderWidth: 1,
    borderColor: colors.divider,
    overflow: 'hidden',
    boxShadow: isDark
      ? '0 8px 18px rgba(0, 0, 0, 0.12)'
      : '0 8px 18px rgba(15, 23, 42, 0.06)',
  },
  quickSettingsTitle: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.text.secondary,
  },
  quickTogglesRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
    gap: 8,
  },
  quickToggleButton: {
    flex: 1,
    minWidth: 0,
    minHeight: compactQuickActions ? 48 : 50,
    borderRadius: 13,
    justifyContent: compactQuickActions ? 'center' : 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: compactQuickActions ? 8 : 6,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.background.paper,
    boxShadow: isDark
      ? '0 3px 8px rgba(0, 0, 0, 0.10)'
      : '0 3px 8px rgba(15, 23, 42, 0.05)',
  },
  quickToggleButtonDisabled: {
    opacity: 0.72,
  },
  quickToggleIcon: {
    width: compactQuickActions ? 38 : 30,
    height: compactQuickActions ? 38 : 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
    marginRight: compactQuickActions ? 0 : 5,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
  },
  quickToggleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    textAlign: 'left',
    flexShrink: 1,
    minWidth: 0,
  },
  languageFlag: {
    fontSize: 18,
  },
  mainContent: {
    flex: 1,
    paddingTop: 80, // Space for the header
    backgroundColor: colors.background.default,
  },
  logo: {
    width: isMobile ? 90 : 120,
    height: isMobile ? 90 : 120,
  }
  });
};
