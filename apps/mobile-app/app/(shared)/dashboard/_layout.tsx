import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Image, Platform, Animated as RNAnimated, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, interpolate, withSpring, useAnimatedProps } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '../../../lib/vector-icons';
import { useRouter, usePathname, useNavigation as useExpoNavigation } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@hashpass/types';
import { useTheme } from '../../../hooks/useTheme';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useAuth } from '../../../hooks/useAuth';
import { authService } from '@hashpass/auth';
import { supabase } from '../../../lib/supabase';
import { useLanguage } from '../../../providers/LanguageProvider';
import { isAdmin } from '../../../lib/admin-utils';
import { ScrollProvider, useScroll } from '@contexts/ScrollContext';
import { NotificationProvider, useNotifications } from '@contexts/NotificationContext';
import { useEvent } from '@contexts/EventContext';
import { AnimationProvider, useAnimations } from '../../../providers/AnimationProvider';
import VersionDisplay from '../../../components/VersionDisplay';
import QRScanner from '../../../components/QRScanner';
import MiniNotificationDropdown from '../../../components/MiniNotificationDropdown';
import { t } from '@lingui/macro';
import { CopilotStep, walkthroughable, useCopilot } from 'react-native-copilot';

// DrawerNavigationProp generic constraint mismatch across @react-navigation versions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrawerNavigation = any;

const CopilotTouchableOpacity = walkthroughable(TouchableOpacity);
const CopilotView = walkthroughable(View);

// Custom drawer content component
function CustomDrawerContent() {
  const { colors, isDark, toggleTheme } = useTheme();
  const { signOut, user } = useAuth();
  const { event } = useEvent();
  const { locale, setLocale } = useLanguage();
  const { unreadCount } = useNotifications();
  const { animationsEnabled } = useAnimations();
  const router = useRouter();
  const pathname = usePathname();
  const navigation = useNavigation<DrawerNavigation>();
  const copilotHook = useCopilot() as any;
  const isMobile = useIsMobile();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth } = useWindowDimensions();
  const compactQuickActions = viewportWidth < 480;
  const styles = getStyles(isDark, colors, isMobile, insets, compactQuickActions);
  const [isUserAdmin, setIsUserAdmin] = React.useState(false);
  const brandBadgeText =
    event?.tour?.role === 'hub'
      ? 'BSL ON TOUR'
      : event?.name || event?.title || 'BSL';
  const brandBadgeColor = event?.branding?.primaryColor || '#007AFF';

  // Animated fluid gradient effect with multiple layers
  const gradientAnimation1 = useSharedValue(0);
  const gradientAnimation2 = useSharedValue(0);
  const gradientAnimation3 = useSharedValue(0);
  const gradientAnimation4 = useSharedValue(0);

  // Logo zoom animation
  const logoScale = useSharedValue(1);

  useEffect(() => {
    // Only start animations if animations are enabled
    if (animationsEnabled) {
      // Start all animations with different durations and delays for fluid movement
      console.log('Starting fluid gradient animations');
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
    } else {
      // Stop all animations and reset to initial state
      console.log('Stopping fluid gradient animations');
      gradientAnimation1.value = 0;
      gradientAnimation2.value = 0;
      gradientAnimation3.value = 0;
      gradientAnimation4.value = 0;
    }
  }, [animationsEnabled]);

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

  // Check admin status on mount
  React.useEffect(() => {
    const checkAdminStatus = async () => {
      if (user) {
        const admin = await isAdmin(user.id);
        setIsUserAdmin(admin);
      }
    };
    checkAdminStatus();
  }, [user]);

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

  const handleNavigation = (route: typeof menuItems[number]['route']) => {
    // Safety check: ensure route is defined
    if (!route || typeof route !== 'string') {
      console.warn('Invalid route provided to handleNavigation:', route);
      return;
    }

    // Close the drawer
    navigation.dispatch(DrawerActions.closeDrawer());

    // Only navigate if we're not already on this screen
    const currentPath = pathname || '';
    const isActive = route.startsWith('./')
      ? currentPath === route || currentPath.endsWith(route.replace('./', ''))
      : currentPath.startsWith(route);

    if (!isActive) {
      // Navigate to the route - all routes are relative now
      router.push(route);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      router.replace('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleLanguageToggle = async () => {
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
    navigation.dispatch(DrawerActions.closeDrawer());
    router.push('./explore' as any);
  };

  const handleLogoPressIn = () => {
    logoScale.value = withSpring(1.1, {
      damping: 10,
      stiffness: 300,
    });
  };

  const handleLogoPressOut = () => {
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
        {/* Animated Fluid Gradient Background Layers - only render when animations enabled */}
        {animationsEnabled ? (
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
          <View style={styles.logoContainer}>
            <TouchableOpacity
              onPress={handleLogoPress}
              onPressIn={handleLogoPressIn}
              onPressOut={handleLogoPressOut}
              activeOpacity={1}
              // @ts-ignore - Web-specific hover handlers
              onMouseEnter={handleLogoHoverIn}
              onMouseLeave={handleLogoHoverOut}
            >
              <Animated.View style={[
                styles.logoPill,
                {
                  backgroundColor: isDark ? colors.primaryLight : colors.primaryDark, // Solid background matching drawer header
                  borderColor: colors.primaryContrastText + '66', // White border with opacity
                  zIndex: 10, // Ensure logo card is above animated background
                },
                logoAnimatedStyle
              ]}>
                <Image
                  source={isDark
                    ? require('../../../assets/logos/hashpass/logo-full-hashpass-white-cyan.svg')
                    : require('../../../assets/logos/hashpass/logo-full-hashpass-white.svg')
                  }
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </Animated.View>
            </TouchableOpacity>
          </View>
          <View style={styles.brandingSection}>
            <Text style={styles.brandSubtitle}>{t({ id: 'nav.brandSubtitle', message: 'Digital Event Platform' })}</Text>
            <View style={[styles.brandBadge, { backgroundColor: brandBadgeColor }]}>
              <Text style={styles.brandBadgeText}>{brandBadgeText}</Text>
            </View>
          </View>
        </View>
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
                  console.log(`Sidebar item clicked: ${item.route}, stepOrder: ${stepOrder}`);

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
                        navigation.dispatch(DrawerActions.closeDrawer());
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
            onPress={toggleTheme}
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
            style={styles.quickToggleButton}
            onPress={handleLogout}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t({ id: 'nav.logout', message: 'Logout' })}
          >
            <View style={[styles.quickToggleIcon, { backgroundColor: 'rgba(255, 59, 48, 0.12)' }]}>
              <Ionicons
                name="log-out-outline"
                size={20}
                color={colors.error.main}
              />
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
      <VersionDisplay showInSidebar={true} bottomInset={insets.bottom} />
    </View>
  );
}

// Main Dashboard Layout
export default function DashboardLayout() {
  const { colors, isDark } = useTheme();
  const isMobile = useIsMobile();
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const styles = getStyles(isDark, colors, isMobile);
  const AUTH_RECENT_SUCCESS_KEY = 'auth_recent_success_at';
  const AUTH_REDIRECT_GRACE_MS = 12000;

  // Verify user is logged in before allowing dashboard access (provider-agnostic)
  React.useEffect(() => {
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

    if (!authLoading && !isLoggedIn) {
      if (shouldDelayRedirectForRecentAuth()) {
        console.log('⏳ Recent auth success detected in dashboard; delaying redirect and rechecking session.');
        authService.getSession().catch((error: unknown) => {
          console.debug('Dashboard auth recheck during redirect grace failed:', error);
        });
        return;
      }

      console.warn('⚠️ Not authenticated in dashboard, redirecting to auth');
      router.replace('/(shared)/auth' as any);
    }
  }, [authLoading, isLoggedIn, router, AUTH_RECENT_SUCCESS_KEY, AUTH_REDIRECT_GRACE_MS]);

  // Header component for the drawer screens
  const Header = () => {
    const drawerNavigation = useNavigation<DrawerNavigation>();
    const headerRouter = useRouter();
    const { headerOpacity, headerBackground, headerTint, headerBlur, headerBorderWidth, headerHeight, setHeaderHeight, scrollY } = useScroll();
    const { animationsEnabled } = useAnimations();
    const { user } = useAuth();
    const copilotHook = useCopilot() as any;
    const handleNext = copilotHook?.handleNext || copilotHook?.handleNth;
    const [qrScannerVisible, setQrScannerVisible] = React.useState(false);

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

    // Build rgba string dynamically with smooth gradient transitions
    // More interpolation points for smoother color transitions
    // At the beginning (scrollY = 0), use full app background color (no transparency)
    // If animations disabled, use solid color like sidebar
    const adjustedHeaderBackground = animationsEnabled
      ? scrollY.interpolate({
        inputRange: [
          0,
          HEADER_SCROLL_DISTANCE * 0.15,
          HEADER_SCROLL_DISTANCE * 0.3,
          HEADER_SCROLL_DISTANCE * 0.5,
          HEADER_SCROLL_DISTANCE * 0.7,
          HEADER_SCROLL_DISTANCE * 0.85,
          HEADER_SCROLL_DISTANCE
        ],
        outputRange: [
          `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, 1)`,   // Start with full app background color (100% opaque, 100% theme)
          `rgba(${Math.round(bgRgb.r * 0.9 + bannerRgb.r * 0.1)}, ${Math.round(bgRgb.g * 0.9 + bannerRgb.g * 0.1)}, ${Math.round(bgRgb.b * 0.9 + bannerRgb.b * 0.1)}, 0.9)`,   // 90% theme, 10% banner, slightly transparent
          `rgba(${Math.round(bgRgb.r * 0.7 + bannerRgb.r * 0.3)}, ${Math.round(bgRgb.g * 0.7 + bannerRgb.g * 0.3)}, ${Math.round(bgRgb.b * 0.7 + bannerRgb.b * 0.3)}, 0.7)`,   // 70% theme, 30% banner
          `rgba(${Math.round(bgRgb.r * 0.5 + bannerRgb.r * 0.5)}, ${Math.round(bgRgb.g * 0.5 + bannerRgb.g * 0.5)}, ${Math.round(bgRgb.b * 0.5 + bannerRgb.b * 0.5)}, 0.5)`,   // 50% theme, 50% banner
          `rgba(${Math.round(bgRgb.r * 0.3 + bannerRgb.r * 0.7)}, ${Math.round(bgRgb.g * 0.3 + bannerRgb.g * 0.7)}, ${Math.round(bgRgb.b * 0.3 + bannerRgb.b * 0.7)}, 0.3)`,   // 30% theme, 70% banner
          `rgba(${Math.round(bgRgb.r * 0.15 + bannerRgb.r * 0.85)}, ${Math.round(bgRgb.g * 0.15 + bannerRgb.g * 0.85)}, ${Math.round(bgRgb.b * 0.15 + bannerRgb.b * 0.85)}, 0.2)`,   // 15% theme, 85% banner
          `rgba(${bannerRgb.r}, ${bannerRgb.g}, ${bannerRgb.b}, 0.15)`   // 100% banner color when scrolled
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
        style={[
          styles.header,
          {
            backgroundColor: 'transparent',
            borderBottomWidth: headerBorderWidth,
            borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
            boxShadow: isDark
              ? '0 3px 6px rgba(0, 0, 0, 0.36)'
              : '0 3px 6px rgba(15, 23, 42, 0.18)',
            overflow: 'hidden',
          }
        ]}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
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
                <BlurView
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
                onPress={() => {
                  console.log('Menu button clicked in tutorial');
                  // Open the drawer first
                  try {
                    drawerNavigation.dispatch(DrawerActions.openDrawer());
                  } catch (e) {
                    console.error('Error opening drawer:', e);
                  }

                  // Wait for drawer animation, then continue tutorial
                  setTimeout(() => {
                    console.log('Continuing tutorial to step 2');
                    // Use handleNth to go directly to step 2 (first sidebar item)
                    if (copilotHook?.handleNth && typeof copilotHook.handleNth === 'function') {
                      copilotHook.handleNth(2);
                    } else if (copilotHook?.handleNext && typeof copilotHook.handleNext === 'function') {
                      copilotHook.handleNext();
                    } else {
                      console.warn('No handleNext or handleNth available', copilotHook);
                    }
                  }, 1200); // Increased delay to ensure drawer is fully open
                }}
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

          <TouchableOpacity
            onPress={() => headerRouter.push('./explore' as any)}
            style={styles.headerLogoContainer}
            activeOpacity={0.8}
          >
            <Image
              source={isDark
                ? require('../../../assets/logos/hashpass/logo-full-hashpass-white-cyan.svg')
                : require('../../../assets/logos/hashpass/logo-full-hashpass-white.svg')
              }
              style={styles.headerLogoImage}
              resizeMode="contain"
            />
          </TouchableOpacity>

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
        <QRScanner
          visible={qrScannerVisible}
          onClose={() => setQrScannerVisible(false)}
          onScanSuccess={(result: unknown) => {
            console.log('QR Scan Success:', result);
            setQrScannerVisible(false);
            // You can add navigation or other actions here based on scan result
          }}
          onScanError={(error: unknown) => {
            console.error('QR Scan Error:', error);
            // Error is already shown in the scanner component
          }}
        />

      </RNAnimated.View>
    );
  };

  // Screen component with header
  const ScreenWithHeader = () => {
    const { headerHeight } = useScroll();

    // Header should overlay content without taking space
    // Only reserve space for StatusBar
    const statusBarHeight = StatusBar.currentHeight || 0;

    return (
      <View style={[styles.headerContainer, {
        height: statusBarHeight,
        backgroundColor: 'transparent',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
      }]}>
        <StatusBar
          barStyle={colors.background.default === '#FFFFFF' ? 'dark-content' : 'light-content'}
          backgroundColor="transparent"
          translucent={true}
        />
        <Header />
      </View>
    );
  };


  return (
    <AnimationProvider>
      <NotificationProvider>
        <ScrollProvider>
          <View style={{ flex: 1 }}>
            <Drawer
              drawerContent={CustomDrawerContent}
              screenOptions={{
                header: () => <ScreenWithHeader />,
                drawerType: 'front',
                drawerStyle: {
                  width: isMobile ? '88%' : 360,
                },
                overlayColor: 'rgba(0,0,0,0.5)',
                drawerPosition: 'left',
              }}
            >
              <Drawer.Screen
                name="explore"
                options={{
                  headerShown: true,
                  header: () => <ScreenWithHeader />,
                }}
              />
              <Drawer.Screen
                name="notifications"
                options={{
                  headerShown: true,
                  header: () => <ScreenWithHeader />,
                }}
              />
              <Drawer.Screen
                name="wallet"
                options={{
                  headerShown: true,
                  header: () => <ScreenWithHeader />,
                }}
              />
              <Drawer.Screen
                name="profile"
                options={{
                  headerShown: true,
                  header: () => <ScreenWithHeader />,
                }}
              />
              <Drawer.Screen
                name="settings"
                options={{
                  headerShown: true,
                  header: () => <ScreenWithHeader />,
                }}
              />
              <Drawer.Screen
                name="admin"
                options={{
                  headerShown: true,
                  header: () => <ScreenWithHeader />,
                }}
              />
              <Drawer.Screen
                name="qr-view"
                options={{
                  headerShown: true,
                  header: () => <ScreenWithHeader />,
                }}
              />
              <Drawer.Screen
                name="pass-details"
                options={{
                  headerShown: true,
                  header: () => <ScreenWithHeader />,
                }}
              />
            </Drawer>
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
  insets: { top?: number; left?: number; right?: number; bottom?: number } = {},
  compactQuickActions = false,
) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.default,
  },
  headerContainer: {
    backgroundColor: 'transparent',
    zIndex: 1000,
    pointerEvents: 'box-none', // Allow scroll to pass through
  },
  header: {
    position: 'absolute',
    top: StatusBar.currentHeight || 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    pointerEvents: 'box-none', // Allow touch events to pass through to content, but keep buttons clickable
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
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
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  headerLogoContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: -1, // Place behind buttons
  },
  headerLogoImage: {
    width: 120,
    height: 40,
  },
  drawerHeader: {
    paddingTop: (isMobile ? 12 : 18)
      + (insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0)),
    paddingBottom: isMobile ? 14 : 18,
    paddingHorizontal: 18,
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
    gap: 12,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 2,
    boxShadow: '0 3px 6px rgba(0, 0, 0, 0.18)',
  },
  logoImage: {
    width: 72,
    height: 72,
  },
  brandingSection: {
    flex: 1,
    alignItems: 'flex-start',
  },
  brandSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  brandBadge: {
    backgroundColor: isDark ? colors.primaryLight : colors.primaryDark,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.primaryContrastText + '26',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.14)',
  },
  brandBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primaryContrastText,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
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
    paddingStart: (isMobile ? 24 : 20) + (insets.left || 0),
    paddingEnd: (isMobile ? 20 : 18) + (insets.right || 0),
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
    paddingHorizontal: isMobile ? 16 : 14,
    marginVertical: isMobile ? 6 : 5,
    borderRadius: isMobile ? 18 : 16,
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : colors.background.default,
    position: 'relative',
    overflow: 'hidden',
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
    marginStart: (isMobile ? 20 : 16) + (insets.left || 0),
    marginEnd: (isMobile ? 18 : 16) + (insets.right || 0),
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
