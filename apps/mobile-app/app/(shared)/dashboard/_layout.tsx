import { isPublicExplorerRoute } from "../../../lib/public-routes";
import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Image,
  Platform,
  Animated as RNAnimated,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
  Modal,
  Dimensions,
  type DimensionValue,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import { SystemBars } from "react-native-edge-to-edge";
import { Ionicons } from "../../../lib/vector-icons";
import { MorphIcon, type MorphHandle } from "../../../lib/morph-icon";
import { Menu as LucideMenu, X as LucideX } from "lucide";
import {
  Slot,
  useRouter,
  usePathname,
  useNavigation as useExpoNavigation,
} from "expo-router";
import { Drawer } from "expo-router/drawer";
import { DrawerActions, useNavigation } from "@react-navigation/native";
import { useDrawerStatus } from "@react-navigation/drawer";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@hashpass/types";
import { useTheme } from "../../../hooks/useTheme";
import { useIsMobile } from "../../../hooks/useIsMobile";
import { useAuth } from "../../../hooks/useAuth";
import { authService } from "@hashpass/auth";
import { useLanguage } from "../../../providers/LanguageProvider";
import {
  canLoadCurrentAdminAccess,
  getCurrentAdminAccess,
} from "../../../lib/admin-access";
import { ScrollProvider, useScroll } from "@contexts/ScrollContext";
import {
  NotificationProvider,
  useNotifications,
} from "@contexts/NotificationContext";
import { useEvent } from "@contexts/EventContext";
import {
  AnimationProvider,
  useAnimations,
} from "../../../providers/AnimationProvider";
import { DiscoveryScopeProvider } from "../../../providers/DiscoveryScopeProvider";
import VersionDisplay from "../../../components/VersionDisplay";
import LoadingScreen from "../../../components/LoadingScreen";
import SafeBlurView from "../../../components/SafeBlurView";
import QRScanner from "../../../components/QRScanner";
import MiniNotificationDropdown from "../../../components/MiniNotificationDropdown";
import { hasRecentAuthSuccess } from "../../../lib/auth/recent-auth";
import { isDevAuthBypassEnabled } from "../../../lib/auth/dev-bypass";
import { resolveAvatarUrl } from "../../../lib/auth/avatar";
import ProfileAvatar from "../../../components/ProfileAvatar";
import { supabase } from "../../../lib/supabase";
import { navigateDashboardBrandToLanding } from "../../../lib/dashboard-navigation";
import { openTargetedDashboardDrawer } from "../../../lib/dashboard-drawer";
import { parseAuthQrScan } from "../../../lib/auth-qr";
import type { HashpassQrResolution } from "../../../types/qr-payload.types";
import { getAvailableEvents } from "../../../lib/event-detector";
import { publicEventStatus } from "../../../lib/public-events";
import {
  passSystemService,
  type EventPassInfo,
} from "../../../lib/pass-system";
import { t } from "@lingui/macro";
import { CopilotStep, walkthroughable, useCopilot } from "@lib/copilot-shim";
import { hapticLight, hapticMedium } from "../../../lib/haptics";
import { uiTokens } from "@hashpass/ui/tokens";
import { ChevronDownIcon } from "../../../components/icons/SettingsIcons";

const ANDROID_DASHBOARD_HEADER_HEIGHT = 64;
const ANDROID_DRAWER_EDGE_GUARD = 16;
const ANDROID_DRAWER_BOTTOM_GUARD = 56;
// useWindowDimensions() can briefly report a stale/zero width on some Android
// devices right after a cold start or resume, before the native bridge has
// measured the window -- multiplying that straight into the drawer width
// below would render (or flash) an effectively invisible 0px-wide drawer.
// Dimensions.get('window') reads the current value imperatively rather than
// through that same hook, so it's a same-tick fallback; this constant is the
// last-resort default if even that comes back unusable.
const DASHBOARD_DRAWER_FALLBACK_VIEWPORT_WIDTH = 360;

type DashboardDrawerInsets = {
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
};

const getDashboardDrawerInsets = (insets: DashboardDrawerInsets = {}) => ({
  top:
    Platform.OS === "android"
      ? Math.max(insets.top || 0, StatusBar.currentHeight || 0)
      : insets.top || 0,
  left:
    Platform.OS === "android"
      ? Math.max(insets.left || 0, ANDROID_DRAWER_EDGE_GUARD)
      : insets.left || 0,
  right:
    Platform.OS === "android"
      ? Math.max(insets.right || 0, ANDROID_DRAWER_EDGE_GUARD)
      : insets.right || 0,
  bottom:
    Platform.OS === "android"
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
type DrawerOpenControlRef = React.MutableRefObject<{
  setOpen: (open: boolean) => void;
} | null>;

const CopilotTouchableOpacity = walkthroughable(TouchableOpacity);
const CopilotView = walkthroughable(View);

// Custom drawer content component
export function CustomDrawerContent({
  navRef,
  navigation: drawerContentNavigation,
  onDrawerStatusChange,
  openCloseControlRef,
  languageRef,
}: {
  navRef?: DrawerNavRef;
  navigation?: DrawerNavigation;
  onDrawerStatusChange?: (isOpen: boolean) => void;
  openCloseControlRef?: DrawerOpenControlRef;
  languageRef: React.MutableRefObject<ReturnType<typeof useLanguage>>;
}) {
  const { colors, isDark, toggleTheme } = useTheme();
  const { signOut, user, isLoading: authLoading, dbUserId } = useAuth();
  const { event } = useEvent();
  // Drawer content can render through React Navigation's portal on web, where
  // context propagation is not guaranteed. The parent captures the live
  // language session and passes it through a stable ref so locale changes do
  // not recreate the drawer component or lose the provider boundary.
  const { locale, setLocale } = languageRef.current;
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
  const setDrawerOpen = React.useCallback(
    (open: boolean) => {
      if (openCloseControlRef?.current?.setOpen) {
        openCloseControlRef.current.setOpen(open);
        return;
      }
      try {
        navigation.dispatch(
          open ? DrawerActions.openDrawer() : DrawerActions.closeDrawer(),
        );
      } catch (drawerError) {
        console.error(
          "Error toggling drawer (fallback dispatch):",
          drawerError,
        );
      }
    },
    [openCloseControlRef, navigation],
  );
  useEffect(() => {
    return () => {
      if (navRef && navRef.current === navigation) {
        navRef.current = null;
      }
    };
  }, [navigation, navRef]);
  const drawerStatus = useDrawerStatus();
  useEffect(() => {
    onDrawerStatusChange?.(drawerStatus === "open");
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
  const drawerSafeInsets = getDashboardDrawerInsets(insets);
  const styles = getStyles(isDark, colors, isMobile, drawerSafeInsets);
  const [isUserAdmin, setIsUserAdmin] = React.useState(false);
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const [isProfileExpanded, setIsProfileExpanded] = React.useState(false);
  const [accountPasses, setAccountPasses] = React.useState<EventPassInfo[]>([]);
  const [menuInteractionId, setMenuInteractionId] = React.useState<
    string | null
  >(null);
  const [rawSupabaseUser, setRawSupabaseUser] = React.useState<unknown>(null);
  const menuIconMotionRefs = useRef<Record<string, any>>({});
  const animateMenuIcon = useCallback((id: string, isEmphasized: boolean) => {
    const motion =
      menuIconMotionRefs.current[id] ||
      (menuIconMotionRefs.current[id] = new RNAnimated.Value(0));

    RNAnimated.timing(motion, {
      toValue: isEmphasized ? 1 : 0,
      duration: isEmphasized ? 160 : 120,
      useNativeDriver: true,
    }).start();
  }, []);
  React.useEffect(() => {
    let active = true;

    if (!dbUserId) {
      setAccountPasses([]);
      return () => {
        active = false;
      };
    }

    passSystemService
      .getAllUserPasses(dbUserId)
      .then((passes: EventPassInfo[]) => {
        if (active) setAccountPasses(passes);
      })
      .catch((error: unknown) => {
        console.error("Unable to load drawer account stats:", error);
        if (active) setAccountPasses([]);
      });

    return () => {
      active = false;
    };
  }, [dbUserId]);

  const upcomingEventCount = React.useMemo(
    () =>
      getAvailableEvents(undefined, { includeAllTenants: true }).filter(
        (availableEvent: ReturnType<typeof getAvailableEvents>[number]) =>
          publicEventStatus(availableEvent) === "upcoming",
      ).length,
    [],
  );
  React.useEffect(() => {
    let active = true;

    if (!user) {
      setRawSupabaseUser(null);
      return () => {
        active = false;
      };
    }

    void supabase.auth.getSession().then(({ data }: { data: any }) => {
      if (active) setRawSupabaseUser(data?.session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
      if (active) setRawSupabaseUser(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [user?.id]);
  const sentRequestCount = React.useMemo(
    () =>
      accountPasses.reduce(
        (total, pass) => total + Math.max(0, Number(pass.used_requests) || 0),
        0,
      ),
    [accountPasses],
  );

  const username = React.useMemo(() => {
    const email = typeof user?.email === "string" ? user.email.trim() : "";
    const localPart = email.split("@")[0]?.trim();
    return localPart
      ? `@${localPart}`
      : t({ id: "nav.account", message: "Account" });
  }, [user?.email]);
  const memberSince = React.useMemo(() => {
    const createdAt = user?.created_at || user?.date_created;
    if (!createdAt) return null;
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      year: "numeric",
    }).format(date);
  }, [locale, user?.created_at, user?.date_created]);
  const accountDisplayName = React.useMemo(() => {
    const metadata = user?.user_metadata as
      { full_name?: string; name?: string } | undefined;
    const directusName = [user?.first_name, user?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    return (
      metadata?.full_name?.trim() ||
      metadata?.name?.trim() ||
      directusName ||
      username.replace(/^@/, "")
    );
  }, [user?.first_name, user?.last_name, user?.user_metadata, username]);
  const profileAvatarUrl = React.useMemo(() => {
    return resolveAvatarUrl(rawSupabaseUser, user);
  }, [rawSupabaseUser, user]);
  const accountStats = React.useMemo(
    () => [
      {
        value: String(accountPasses.length),
        label: t({ id: "nav.passes", message: "Passes" }),
        color: colors.text.primary,
      },
      {
        value: String(upcomingEventCount),
        label: t({ id: "nav.upcoming", message: "Upcoming" }),
        color: isDark ? "#54c878" : "#2fa556",
      },
      {
        value: sentRequestCount > 99 ? "99+" : String(sentRequestCount),
        label: t({ id: "nav.requests", message: "Requests" }),
        color: isDark ? "#ffb74d" : "#c56f00",
      },
    ],
    [
      accountPasses.length,
      colors.text.primary,
      isDark,
      locale,
      sentRequestCount,
      upcomingEventCount,
    ],
  );

  // Animated fluid gradient effect with multiple layers
  const gradientAnimation1 = useSharedValue(0);
  const gradientAnimation2 = useSharedValue(0);
  const gradientAnimation3 = useSharedValue(0);
  const gradientAnimation4 = useSharedValue(0);

  // Logo zoom animation
  // Native explicitly opts OUT of every decorative drawer animation. Users
  // reported the sidebar felt slow to open and close on native, and the
  // biggest avoidable cost during the slide is these UI-thread reanimated
  // animations (the 4 fluid gradient layers below + the logo spring)
  // contending with the drawer's own open/close transition for frame budget.
  // On native we render a clean static header instead — no gradient layers, no
  // withRepeat animations, no logo spring — so the slide has the whole frame
  // budget to itself. The decoration is kept on web, where it's cheap and the
  // slowness was never reported.
  const decorativeAnimationsEnabled =
    animationsEnabled && Platform.OS === "web";

  useEffect(() => {
    // The 4 gradient layers only animate while the drawer is open AND only on
    // web (see decorativeAnimationsEnabled above — native drops them entirely).
    if (Platform.OS !== "web") return;
    if (decorativeAnimationsEnabled && drawerStatus === "open") {
      // Wait for the open transition to settle before starting the infinite
      // animations, so they never contend with the slide-in for frame budget.
      // The timer is cleared on cleanup (drawer closed, animations toggled off,
      // or unmount) before it can fire.
      const startTimer = setTimeout(() => {
        // Start all animations with different durations for fluid movement
        gradientAnimation1.value = withRepeat(
          withTiming(1, { duration: 4000 }),
          -1,
          true,
        );
        gradientAnimation2.value = withRepeat(
          withTiming(1, { duration: 5000 }),
          -1,
          true,
        );
        gradientAnimation3.value = withRepeat(
          withTiming(1, { duration: 6000 }),
          -1,
          true,
        );
        gradientAnimation4.value = withRepeat(
          withTiming(1, { duration: 3500 }),
          -1,
          true,
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
    const scale = interpolate(
      gradientAnimation1.value,
      [0, 0.5, 1],
      [0.7, 1.3, 0.7],
    );
    return {
      transform: [{ translateX }, { translateY }, { scale }],
      opacity: interpolate(
        gradientAnimation1.value,
        [0, 0.5, 1],
        [0.3, 0.5, 0.3],
      ),
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
    const scale = interpolate(
      gradientAnimation2.value,
      [0, 0.5, 1],
      [1.0, 0.8, 1.0],
    );
    return {
      transform: [{ translateX }, { translateY }, { scale }],
      opacity: interpolate(
        gradientAnimation2.value,
        [0, 0.5, 1],
        [0.25, 0.45, 0.25],
      ),
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
    const scale = interpolate(
      gradientAnimation3.value,
      [0, 0.5, 1],
      [0.8, 1.2, 0.8],
    );
    return {
      transform: [{ translateX }, { translateY }, { scale }],
      opacity: interpolate(
        gradientAnimation3.value,
        [0, 0.5, 1],
        [0.2, 0.4, 0.2],
      ),
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
    const scale = interpolate(
      gradientAnimation4.value,
      [0, 0.5, 1],
      [1.2, 0.7, 1.2],
    );
    return {
      transform: [{ translateX }, { translateY }, { scale }],
      opacity: interpolate(
        gradientAnimation4.value,
        [0, 0.5, 1],
        [0.15, 0.35, 0.15],
      ),
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
          setIsUserAdmin(access.effectiveRole.role !== "user");
        }
      } catch (error) {
        console.error("Unable to load admin access for drawer:", error);
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
      id: "nav.explore",
      message: "Explore",
      icon: "compass-outline",
      route: "./explore" as const,
      tone: "#00A9E0",
    },
    {
      id: "nav.contacts",
      message: "Contacts",
      icon: "people-outline",
      route: "./contacts" as const,
      tone: uiTokens.feature.cyan,
    },
    {
      id: "nav.wallet",
      message: "Wallet",
      icon: "wallet-outline",
      route: "./wallet" as const,
      tone: "#3B82F6",
    },
    {
      id: "nav.notifications",
      message: "Notifications",
      icon: "notifications-outline",
      route: "./notifications" as const,
      tone: "#F59E0B",
    },
    {
      id: "nav.profile",
      message: "Profile",
      icon: "person-outline",
      route: "./profile" as const,
      tone: "#8B5CF6",
    },
    {
      id: "nav.settings",
      message: "Settings",
      icon: "settings-outline",
      route: "./settings" as const,
      tone: "#64748B",
    },
  ] as const;

  // Add admin menu item if user is admin
  const adminMenuItem = isUserAdmin
    ? [
        {
          id: "nav.admin",
          message: "Admin Panel",
          icon: "shield-checkmark-outline",
          route: "./admin" as const,
          tone: "#10B981",
        },
      ]
    : [];

  const menuItems = [...baseMenuItems, ...adminMenuItem] as const;

  const getLabel = (id: (typeof menuItems)[number]["id"]) => {
    switch (id) {
      case "nav.explore":
        return t({ id: "nav.explore", message: "Explore" });
      case "nav.contacts":
        return t({ id: "nav.contacts", message: "Contacts" });
      case "nav.wallet":
        return t({ id: "nav.wallet", message: "Wallet" });
      case "nav.notifications":
        return t({ id: "nav.notifications", message: "Notifications" });
      case "nav.profile":
        return t({ id: "nav.profile", message: "Profile" });
      case "nav.settings":
        return t({ id: "nav.settings", message: "Settings" });
      case "nav.admin":
        return t({ id: "nav.admin", message: "Admin Panel" });
      default:
        return "";
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
  };

  const handleNavigation = (route: (typeof menuItems)[number]["route"]) => {
    hapticLight();
    // Safety check: ensure route is defined
    if (!route || typeof route !== "string") {
      console.warn("Invalid route provided to handleNavigation:", route);
      return;
    }

    // Only navigate if we're not already on this screen
    const currentPath = pathname || "";
    const isActive = route.startsWith("./")
      ? currentPath === route ||
        currentPath.split("/").includes(route.replace("./", ""))
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
      const screenName = route.replace("./", "");
      try {
        navigation.navigate(screenName);
      } catch (navError) {
        console.error("Error navigating from drawer:", navError);
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
    // every auth guard sees the logged-out state right away — that part is
    // never worth waiting on. But the SecureStore/AsyncStorage clear that
    // follows it must finish (or hit its own bounded timeout — see
    // SIGN_OUT_STEP_TIMEOUT_MS in useAuth.ts) before this screen navigates
    // away: a real security race otherwise exists where a process kill
    // right after navigation leaves the old session persisted on disk to be
    // rehydrated on next launch. `waitForRemoteCleanup: false` still keeps
    // this from blocking on the slow/flaky *remote* provider sign-out calls
    // — only the local clear (now itself timeout-bounded) is awaited here,
    // so this can't reintroduce the old unbounded-hang bug that made the
    // dashboard stay visible until a refresh.
    try {
      await signOut({ waitForRemoteCleanup: false });
    } catch (error) {
      console.error("Error signing out:", error);
    }
    router.replace("/(shared)/auth" as any);
  };

  const handleLanguageToggle = async () => {
    hapticLight();
    const locales = ["en", "es", "ko", "fr", "pt", "de", "et"];
    const currentIndex = locales.indexOf(locale);
    const nextIndex = (currentIndex + 1) % locales.length;
    await setLocale(locales[nextIndex]);
  };

  const languageLabel =
    (
      {
        en: t({ id: "settings.languages.en", message: "English" }),
        es: t({ id: "settings.languages.es", message: "Spanish" }),
        ko: t({ id: "settings.languages.ko", message: "Korean" }),
        fr: t({ id: "settings.languages.fr", message: "French" }),
        pt: t({ id: "settings.languages.pt", message: "Portuguese" }),
        de: t({ id: "settings.languages.de", message: "German" }),
        et: t({ id: "settings.languages.et", message: "Estonian" }),
      } as Record<string, string>
    )[locale] || locale.toUpperCase();
  const themeLabel = isDark
    ? t({ id: "nav.lightMode", message: "Light mode" })
    : t({ id: "nav.darkMode", message: "Dark mode" });

  const handleLogoPress = () => {
    navigateDashboardBrandToLanding({
      navigation,
      router,
      closeDrawerAction: DrawerActions.closeDrawer(),
      // Use the same resilient imperative close path as every other drawer
      // toggle in this file (see the DrawerOpenControlRef comment above) --
      // navigateDashboardBrandToLanding also now defers the actual route
      // replace by one tick so it never races the drawer's still-in-flight
      // close transition (the native crash this tap was causing).
      closeDrawer: () => setDrawerOpen(false),
    });
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background.default, flex: 1 },
      ]}
    >
      {/* Sidebar v2: quiet chrome, a clear account anchor, and a compact
          navigation rhythm that keeps the drawer useful at every width. */}
      <View style={styles.drawerHeader}>
        {/* Animated Fluid Gradient Background Layers — web only; native drops
            them entirely so the drawer slide keeps the whole frame budget. */}
        {decorativeAnimationsEnabled ? (
          <>
            <Animated.View
              style={[
                styles.fluidGradientLayer,
                {
                  backgroundColor: isDark
                    ? "rgba(175, 13, 1, 0.14)"
                    : "rgba(30, 58, 138, 0.08)",
                },
                animatedGradientStyle1,
              ]}
            />
            <Animated.View
              style={[
                styles.fluidGradientLayer,
                {
                  backgroundColor: isDark
                    ? "rgba(161, 209, 214, 0.10)"
                    : "rgba(0, 122, 255, 0.06)",
                },
                animatedGradientStyle2,
              ]}
            />
            <Animated.View
              style={[
                styles.fluidGradientLayer,
                {
                  backgroundColor: isDark
                    ? "rgba(255, 215, 0, 0.08)"
                    : "rgba(100, 181, 246, 0.05)",
                },
                animatedGradientStyle3,
              ]}
            />
            <Animated.View
              style={[
                styles.fluidGradientLayer,
                {
                  backgroundColor: isDark
                    ? "rgba(255, 87, 34, 0.06)"
                    : "rgba(63, 81, 181, 0.04)",
                },
                animatedGradientStyle4,
              ]}
            />
          </>
        ) : null}
        <View style={styles.drawerTopBar}>
          <TouchableOpacity
            onPress={handleLogoPress}
            style={styles.drawerBrandButton}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={t({
              id: "nav.backToLanding",
              message: "Back to landing",
            })}
          >
            <Image
              source={
                isDark
                  ? require("../../../assets/logos/hashpass/logo-full-hashpass-white-cyan.webp")
                  : require("../../../assets/logos/hashpass/logo-full-hashpass-black-cyan.png")
              }
              style={styles.drawerBrandLogo}
              resizeMode="contain"
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={closeDrawer}
            style={styles.drawerCloseButton}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={t({
              id: "nav.closeMenu",
              message: "Close navigation menu",
            })}
          >
            <Ionicons name="close" size={20} color={colors.text.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.profileIdentityRow}>
            <TouchableOpacity
              onPress={() => handleNavigation("./profile")}
              style={styles.profileAvatarButton}
              activeOpacity={0.82}
              accessibilityRole="link"
              accessibilityLabel={t({ id: "nav.profile", message: "Profile" })}
            >
              <View style={styles.profileAvatarShell}>
                <View style={styles.profileAvatar}>
                  <ProfileAvatar
                    uri={profileAvatarUrl}
                    name={accountDisplayName}
                    isDark={isDark}
                    initialsSize={isMobile ? 19 : 22}
                  />
                </View>
                <View style={styles.profileAvatarAction}>
                  <Ionicons
                    name="camera-outline"
                    size={15}
                    color={uiTokens.colors.light.onAccent}
                  />
                </View>
              </View>
            </TouchableOpacity>
            <View style={styles.profileCopy}>
              <TouchableOpacity
                onPress={() => handleNavigation("./profile")}
                style={styles.profileUsernameButton}
                activeOpacity={0.75}
                accessibilityRole="link"
                accessibilityLabel={`${username}: ${t({
                  id: "nav.profile",
                  message: "Profile",
                })}`}
              >
                <Text style={styles.profileUsername} numberOfLines={1}>
                  {username}
                </Text>
              </TouchableOpacity>
              <Text style={styles.profileEmail} numberOfLines={1}>
                {user?.email || accountDisplayName}
              </Text>
              <View style={styles.profileMetaRow}>
                <Text style={styles.profileBrandBadge}>HASHPASS</Text>
                {!isProfileExpanded && memberSince ? (
                  <Text style={styles.profileMemberSince} numberOfLines={1}>
                    {t({ id: "nav.since", message: "Since" })} {memberSince}
                  </Text>
                ) : null}
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setIsProfileExpanded((expanded) => !expanded)}
              style={styles.profileChevronButton}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={t({
                id: "nav.accountDetails",
                message: "Account details",
              })}
              accessibilityState={{ expanded: isProfileExpanded }}
            >
              <View
                style={{
                  transform: [
                    { rotate: isProfileExpanded ? "180deg" : "0deg" },
                  ],
                }}
              >
                <ChevronDownIcon
                  size={18}
                  color={colors.text.secondary}
                  strokeWidth={2.25}
                />
              </View>
            </TouchableOpacity>
          </View>
          {isProfileExpanded ? (
            <>
              <View style={styles.profileStatsRow}>
                {accountStats.map((stat) => (
                  <View key={stat.label} style={styles.profileStat}>
                    <Text style={[styles.profileStatValue, { color: stat.color }]}>
                      {stat.value}
                    </Text>
                    <Text style={styles.profileStatLabel}>{stat.label}</Text>
                  </View>
                ))}
              </View>
              {memberSince ? (
                <Text style={styles.profileMemberSinceExpanded} numberOfLines={1}>
                  {t({ id: "nav.memberSince", message: "Member since" })} {memberSince}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>
      </View>

      {/* Menu Items - Scrollable on mobile */}
      <View style={styles.drawerDivider} />
      <ScrollView
        style={styles.menuItemsScrollView}
        contentContainerStyle={styles.menuItemsContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        bounces={false}
      >
        <Text style={styles.menuSectionLabel}>
          {t({ id: "nav.navigation", message: "Navigation" })}
        </Text>
        {menuItems.map((item, index) => {
          // Safety check: ensure route exists
          if (!item.route || typeof item.route !== "string") {
            console.warn("Menu item has invalid route:", item);
            return null;
          }

          // Keep selection tied to the displayed route, including nested screens.
          const isActive = item.route.startsWith("./")
            ? pathname === item.route ||
              pathname.split("/").includes(item.route.replace("./", ""))
            : pathname.startsWith(item.route);
          const isInteracting = menuInteractionId === item.id;
          const iconMotion =
            menuIconMotionRefs.current[item.id] ||
            (menuIconMotionRefs.current[item.id] = new RNAnimated.Value(0));
          const iconScale = iconMotion.interpolate({
            inputRange: [0, 1],
            outputRange: [isActive ? 1.02 : 1, isActive ? 1.1 : 1.08],
          });
          const stepOrder = index + 2; // Start from 2 (after menu button)
          const stepNames: Record<string, string> = {
            "./explore": "sidebarExplore",
            "./contacts": "sidebarContacts",
            "./wallet": "sidebarWallet",
            "./notifications": "sidebarNotifications",
            "./profile": "sidebarProfile",
            "./settings": "sidebarSettings",
            "./admin": "sidebarAdmin",
          };
          const stepTexts: Record<string, string> = {
            "./contacts": t({
              id: "nav.tour.contacts",
              message: "Contacts: Shape your interests, exchange contact cards and grow your network.",
            }),
            "./explore":
              t({
                id: "nav.tour.explore",
                message:
                  "Explore: Browse events, view your passes, and access quick links to speakers, agenda, and networking. Tap to continue.",
              }),
            "./wallet":
              t({
                id: "nav.tour.wallet",
                message:
                  "Wallet: View and manage your digital passes and tickets for events. Tap to continue.",
              }),
            "./notifications":
              t({
                id: "nav.tour.notifications",
                message:
                  "Notifications: Check your meeting requests, updates, and important alerts. The badge shows unread count. Tap to continue.",
              }),
            "./profile":
              t({
                id: "nav.tour.profile",
                message:
                  "Profile: View and edit your profile information and account settings. Tap to continue.",
              }),
            "./settings":
              t({
                id: "nav.tour.settings",
                message:
                  "Settings: Customize app preferences, theme, language, and tutorials. Tap to finish sidebar tour.",
              }),
            "./admin":
              t({
                id: "nav.tour.admin",
                message:
                  "Admin Panel: Manage passes, scan QR codes, and create meeting matches. Admin access only.",
              }),
          };
          return (
            <React.Fragment key={item.route as string}>
              {item.route === "./admin" ? (
                <Text style={styles.menuSectionLabel}>
                  {t({ id: "nav.adminSection", message: "Admin" })}
                </Text>
              ) : null}
              <CopilotStep
                text={
                  stepTexts[item.route] || `Navigate to ${getLabel(item.id)}`
                }
                order={stepOrder}
                name={stepNames[item.route] || `sidebar${item.id}`}
              >
                <CopilotTouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={getLabel(item.id)}
                  style={[
                    styles.menuItem,
                    {
                      backgroundColor: isActive
                        ? isDark
                          ? "rgba(175, 13, 1, 0.20)"
                          : "rgba(175, 13, 1, 0.08)"
                        : isInteracting
                          ? isDark
                            ? "rgba(255, 106, 77, 0.10)"
                            : "rgba(175, 13, 1, 0.045)"
                          : "transparent",
                      boxShadow: isActive
                        ? isDark
                          ? "0 8px 18px rgba(0, 0, 0, 0.28)"
                          : "0 8px 18px rgba(175, 13, 1, 0.10)"
                        : undefined,
                    },
                  ]}
                  onHoverIn={() => {
                    setMenuInteractionId(item.id);
                    animateMenuIcon(item.id, true);
                  }}
                  onHoverOut={() => {
                    setMenuInteractionId((current) =>
                      current === item.id ? null : current,
                    );
                    animateMenuIcon(item.id, false);
                  }}
                  onFocus={() => {
                    setMenuInteractionId(item.id);
                    animateMenuIcon(item.id, true);
                  }}
                  onBlur={() => {
                    setMenuInteractionId((current) =>
                      current === item.id ? null : current,
                    );
                    animateMenuIcon(item.id, false);
                  }}
                  onPressIn={() => {
                    setMenuInteractionId(item.id);
                    animateMenuIcon(item.id, true);
                  }}
                  onPressOut={() => {
                    setMenuInteractionId((current) =>
                      current === item.id ? null : current,
                    );
                    animateMenuIcon(item.id, false);
                  }}
                  onPress={() => {
                    // Navigate to the actual view first
                    handleNavigation(item.route);

                    // Continue to next tutorial step after a short delay
                    const nextStep = stepOrder + 1;
                    setTimeout(() => {
                      if (
                        copilotHook?.handleNext &&
                        typeof copilotHook.handleNext === "function"
                      ) {
                        copilotHook.handleNext();
                      } else if (
                        copilotHook?.handleNth &&
                        typeof copilotHook.handleNth === "function"
                      ) {
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
                  activeOpacity={0.72}
                >
                  <RNAnimated.View
                    style={{
                      transform: [{ scale: iconScale }],
                    }}
                  >
                    <View
                      style={[
                        styles.menuIconContainer,
                        {
                          backgroundColor: isActive
                            ? uiTokens.colors.light.accent
                            : isInteracting
                              ? isDark
                                ? "rgba(255, 106, 77, 0.18)"
                                : "rgba(175, 13, 1, 0.08)"
                              : isDark
                                ? "rgba(255, 255, 255, 0.08)"
                                : colors.background.paper,
                        },
                      ]}
                    >
                      <Ionicons
                        name={item.icon as any}
                        size={20}
                        color={
                          isActive
                            ? uiTokens.colors.light.onAccent
                            : isInteracting
                              ? isDark
                                ? "#FFB39E"
                                : uiTokens.colors.light.accent
                              : item.tone
                        }
                      />
                    </View>
                  </RNAnimated.View>
                  <Text
                    style={[
                      styles.menuText,
                      {
                        color: colors.text.primary,
                        fontWeight: isActive ? "700" : "600",
                      },
                    ]}
                  >
                    {getLabel(item.id)}
                  </Text>
                  {item.route === "./notifications" && unreadCount > 0 && (
                    <View style={styles.menuBadge}>
                      <Text style={styles.menuBadgeText}>
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </Text>
                    </View>
                  )}
                </CopilotTouchableOpacity>
              </CopilotStep>
            </React.Fragment>
          );
        })}
      </ScrollView>

      {/* Quick Settings & Actions */}
      <View style={styles.drawerDivider} />
      <View style={styles.quickSettingsSection}>
        <Text style={styles.menuSectionLabel}>
          {t({ id: "nav.quickActions", message: "Quick actions" })}
        </Text>
        <View style={styles.quickTogglesRow}>
          {/* Language Toggle */}
          <TouchableOpacity
            style={[styles.quickToggleButton, styles.languageToggleButton]}
            onPress={handleLanguageToggle}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={languageLabel}
          >
            <Ionicons
              name="globe-outline"
              size={22}
              color={colors.text.primary}
            />
            <Text style={styles.quickToggleLabel} numberOfLines={1}>
              {languageLabel}
            </Text>
          </TouchableOpacity>

          {/* Theme Toggle */}
          <TouchableOpacity
            style={[styles.quickToggleButton, styles.themeToggleButton]}
            onPress={() => {
              hapticLight();
              toggleTheme();
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={themeLabel}
          >
            <Ionicons
              name={isDark ? "sunny" : "moon-outline"}
              size={22}
              color={colors.text.primary}
            />
            <Text style={styles.visuallyHiddenLabel}>{themeLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.logoutAction,
              isSigningOut && styles.quickToggleButtonDisabled,
            ]}
            onPress={handleLogout}
            disabled={isSigningOut}
            activeOpacity={isSigningOut ? 1 : 0.7}
            accessibilityRole="button"
            accessibilityLabel={t({ id: "nav.logout", message: "Log out" })}
            accessibilityState={{ busy: isSigningOut, disabled: isSigningOut }}
          >
            {isSigningOut ? (
              <ActivityIndicator size="small" color={colors.error.main} />
            ) : (
              <Ionicons
                name="log-out-outline"
                size={22}
                color={colors.error.main}
              />
            )}
            <Text style={styles.logoutActionText} numberOfLines={1}>
              {t({ id: "nav.logout", message: "Log out" })}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Version Display */}
      <VersionDisplay
        showInSidebar={true}
        bottomInset={drawerSafeInsets.bottom}
      />
    </View>
  );
}

// Main Dashboard Layout
export default function DashboardLayout() {
  const { isLoggedIn } = useAuth();
  const pathname = usePathname();
  // Guest discovery must not mount account loaders, notifications or the
  // authenticated drawer guard. Other dashboard routes keep their guard.
  if (!isLoggedIn && isPublicExplorerRoute(pathname)) return <Slot />;
  return <AuthenticatedDashboardLayout />;
}

function AuthenticatedDashboardLayout() {
  const { colors, isDark } = useTheme();
  const language = useLanguage();
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
  const dashboardDrawerWidth = useMemo<DimensionValue>(() => {
    const dashboardViewportWidth =
      viewportWidth ||
      Dimensions.get("window").width ||
      DASHBOARD_DRAWER_FALLBACK_VIEWPORT_WIDTH;
    return Platform.OS !== "web" && isMobile
      ? Math.ceil(dashboardViewportWidth * 0.8)
      : isMobile
        ? "88%"
        : 360;
  }, [isMobile, viewportWidth]);
  const dashboardDrawerStyle = useMemo(
    () => ({
      width: dashboardDrawerWidth,
      borderTopRightRadius: 24,
      borderBottomRightRadius: 24,
      overflow: "hidden" as const,
    }),
    [dashboardDrawerWidth],
  );
  // Instance-scoped bridge from CustomDrawerContent's navigation object to
  // Header (see the DrawerNavRef comment above CustomDrawerContent).
  const drawerNavRef = useRef<DrawerNavigation | null>(null);
  const languageRef = useRef(language);
  languageRef.current = language;
  // Drawer open/closed is tracked in a REF, not useState, on purpose: it's only
  // ever read (never rendered) — the two copilot `wasOpen` checks below — so
  // making it reactive state bought nothing but a full DashboardLayout
  // re-render (which re-runs the inline `screenOptions` and the Header) on
  // every single open and close, right in the middle of the drawer slide. That
  // JS work competing with the UI-thread slide is part of why the sidebar felt
  // slow. A ref updates without re-rendering, so the slide runs undisturbed.
  const drawerOpenRef = useRef(false);
  // Drives the header hamburger<->close morph imperatively (see lib/morph-icon.tsx)
  // off the same real drawer-status signal as drawerOpenRef, so it fires for every
  // transition (header tap, swipe, back button) without adding React state or a
  // re-render — matching this file's existing "ref, not state" perf pattern.
  const headerMenuIconRef = useRef<MorphHandle>(null);
  const handleDrawerStatusChange = useCallback((isOpen: boolean) => {
    drawerOpenRef.current = isOpen;
    headerMenuIconRef.current?.morphTo(isOpen ? LucideX : LucideMenu);
  }, []);
  // See the DrawerOpenControlRef comment above CustomDrawerContent. Populated
  // by the patched DrawerView; a plain ref so wiring it up doesn't cascade a
  // DashboardLayout re-render, for the same reason as drawerOpenRef above.
  const drawerOpenControlRef: DrawerOpenControlRef = useRef(null);
  const [androidQrScannerVisible, setAndroidQrScannerVisible] = useState(false);
  const [hashpassQrResult, setHashpassQrResult] = useState<HashpassQrResolution | null>(null);
  const [hashpassQrError, setHashpassQrError] = useState<string | null>(null);
  const handleHashpassRawScan = useCallback(async (data: string) => {
    // Keep camera/Expo imports out of the dashboard module graph. Besides
    // making the drawer lighter, this prevents native camera shims from
    // crashing web/Jest consumers that never open the scanner.
    const [{ qrScannerService }, { resolveHashpassQrPayload }] = await Promise.all([
      import("../../../lib/qr-scanner-service"),
      import("../../../lib/qr-payload-resolver"),
    ]);
    const parsed = qrScannerService.parseHashpassPayload(data);
    if (!parsed.isValid || parsed.kind === "qr_token") return false;
    try {
      const resolved = await resolveHashpassQrPayload(parsed);
      setHashpassQrError(null);
      setHashpassQrResult(resolved);
    } catch (error: any) {
      setHashpassQrResult(null);
      setHashpassQrError(error?.message || "Unable to resolve this QR code.");
    }
    return true;
  }, []);
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
        languageRef={languageRef}
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
      console.warn("⚠️ Not authenticated in dashboard, redirecting to auth");
      router.replace("/(shared)/auth" as any);
    }, 2500);

    return () => clearTimeout(redirectTimer);
  }, [authLoading, isLoggedIn, router]);

  const openDashboardDrawer = useCallback(
    (navigation: DrawerNavigation) => {
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
          console.warn("Drawer navigation unavailable, skipping openDrawer");
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
        if (
          dashboardCopilotHook?.handleNth &&
          typeof dashboardCopilotHook.handleNth === "function"
        ) {
          dashboardCopilotHook.handleNth(2);
        } else if (
          dashboardCopilotHook?.handleNext &&
          typeof dashboardCopilotHook.handleNext === "function"
        ) {
          dashboardCopilotHook.handleNext();
        } else {
          console.warn(
            "No handleNext or handleNth available",
            dashboardCopilotHook,
          );
        }
      }, 1200);
    },
    [dashboardCopilotHook],
  );

  const openDashboardDrawerFromHeader = useCallback(
    (navigation: DrawerNavigation) => {
      openDashboardDrawer(navigation);
    },
    [openDashboardDrawer],
  );

  // Header component for the drawer screens
  const Header = () => {
    // Always call the hook (Rules of Hooks), but keep the drawerContent-provided
    // ref as a fallback. It is written from inside the Drawer's actual
    // navigation context, which avoids dispatching drawer actions to a parent
    // Stack navigator during transition edges.
    const navigationFromContext = useNavigation<DrawerNavigation>();
    const headerRouter = useRouter();
    const {
      headerOpacity,
      headerBackground,
      headerTint,
      headerBlur,
      headerBorderWidth,
      headerHeight,
      setHeaderHeight,
      scrollY,
    } = useScroll();
    const { animationsEnabled } = useAnimations();
    const copilotHook = useCopilot() as any;
    const handleNext = copilotHook?.handleNext || copilotHook?.handleNth;
    const [qrScannerVisible, setQrScannerVisible] = React.useState(false);

    React.useEffect(() => {
      if (Platform.OS === "android") {
        setHeaderHeight(ANDROID_DASHBOARD_HEADER_HEIGHT);
      }
    }, [setHeaderHeight]);

    // Adjust header background color based on theme to match app background
    const HEADER_SCROLL_DISTANCE = 100;
    // Extract RGB values from theme background color
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
          }
        : { r: 18, g: 18, b: 18 }; // Fallback to dark color
    };
    const bgRgb = hexToRgb(colors.background.default);

    // Banner colors - typically blue (#007AFF) or event-specific colors
    // When banner is visible, blend with banner color
    const bannerColor = "#007AFF"; // Default banner color
    const bannerRgb = hexToRgb(bannerColor);

    // Interpolate RGB values based on scroll to blend theme color with banner color
    // Only interpolate when animations are enabled
    const blendedR = animationsEnabled
      ? scrollY.interpolate({
          inputRange: [0, HEADER_SCROLL_DISTANCE * 0.5, HEADER_SCROLL_DISTANCE],
          outputRange: [
            bgRgb.r,
            Math.round((bgRgb.r + bannerRgb.r) / 2),
            bannerRgb.r,
          ],
          extrapolate: "clamp",
        })
      : bgRgb.r;

    const blendedG = animationsEnabled
      ? scrollY.interpolate({
          inputRange: [0, HEADER_SCROLL_DISTANCE * 0.5, HEADER_SCROLL_DISTANCE],
          outputRange: [
            bgRgb.g,
            Math.round((bgRgb.g + bannerRgb.g) / 2),
            bannerRgb.g,
          ],
          extrapolate: "clamp",
        })
      : bgRgb.g;

    const blendedB = animationsEnabled
      ? scrollY.interpolate({
          inputRange: [0, HEADER_SCROLL_DISTANCE * 0.5, HEADER_SCROLL_DISTANCE],
          outputRange: [
            bgRgb.b,
            Math.round((bgRgb.b + bannerRgb.b) / 2),
            bannerRgb.b,
          ],
          extrapolate: "clamp",
        })
      : bgRgb.b;

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
            HEADER_SCROLL_DISTANCE,
          ],
          outputRange: [
            `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, 0.95)`,
            `rgba(${Math.round(bgRgb.r * 0.7 + bannerRgb.r * 0.3)}, ${Math.round(bgRgb.g * 0.7 + bannerRgb.g * 0.3)}, ${Math.round(bgRgb.b * 0.7 + bannerRgb.b * 0.3)}, 0.95)`,
            `rgba(${Math.round(bgRgb.r * 0.3 + bannerRgb.r * 0.7)}, ${Math.round(bgRgb.g * 0.3 + bannerRgb.g * 0.7)}, ${Math.round(bgRgb.b * 0.3 + bannerRgb.b * 0.7)}, 0.95)`,
            `rgba(${bannerRgb.r}, ${bannerRgb.g}, ${bannerRgb.b}, 0.95)`,
          ],
          extrapolate: "clamp",
        })
      : colors.background.default; // Solid color when animations disabled

    // Gloss effect animation based on scroll - disabled when animations off
    const glossOpacity = animationsEnabled
      ? scrollY.interpolate({
          inputRange: [0, HEADER_SCROLL_DISTANCE * 0.5, HEADER_SCROLL_DISTANCE],
          outputRange: [0, 0.4, 0.6], // More visible when scrolled
          extrapolate: "clamp",
        })
      : 0; // No gloss when animations disabled

    const glossPosition = animationsEnabled
      ? scrollY.interpolate({
          inputRange: [0, HEADER_SCROLL_DISTANCE],
          outputRange: [-200, 200], // Moves from left to right as you scroll
          extrapolate: "clamp",
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
          Platform.OS !== "web" && {
            backgroundColor: adjustedHeaderBackground as any,
          },
          {
            borderBottomWidth: headerBorderWidth,
            borderBottomColor: isDark
              ? "rgba(255, 255, 255, 0.15)"
              : "rgba(0, 0, 0, 0.15)",
            boxShadow: isDark
              ? "0 3px 6px rgba(0, 0, 0, 0.36)"
              : "0 3px 6px rgba(15, 23, 42, 0.18)",
            overflow: "hidden",
          },
        ]}
        onLayout={
          Platform.OS === "android"
            ? undefined
            : (e) => setHeaderHeight(e.nativeEvent.layout.height)
        }
      >
        {/* Background with blur and gloss effect */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Blur effect - only when animations enabled */}
          {animationsEnabled ? (
            Platform.OS === "web" ? (
              <RNAnimated.View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    backgroundColor: adjustedHeaderBackground as any,
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                  },
                ]}
              />
            ) : (
              <>
                <SafeBlurView
                  intensity={20}
                  tint={isDark ? "dark" : "light"}
                  style={StyleSheet.absoluteFill}
                />
                <RNAnimated.View
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      backgroundColor: adjustedHeaderBackground as any,
                    },
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
                },
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
                },
              ]}
              pointerEvents="none"
            >
              <View
                style={{
                  width: "200%",
                  height: "100%",
                  backgroundColor: "transparent",
                  flexDirection: "row",
                }}
              >
                {/* Left transparent */}
                <View style={{ flex: 1, backgroundColor: "transparent" }} />
                {/* Center gloss highlight */}
                <View
                  style={{
                    width: "50%",
                    height: "100%",
                    backgroundColor: "rgba(255, 255, 255, 0.4)",
                  }}
                />
                {/* Right transparent */}
                <View style={{ flex: 1, backgroundColor: "transparent" }} />
              </View>
            </RNAnimated.View>
          )}
        </View>
        <RNAnimated.View
          pointerEvents="auto"
          style={[
            styles.headerContent,
            animationsEnabled
              ? {
                  opacity: headerOpacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 1],
                  }),
                }
              : {
                  opacity: 1,
                },
            {
              pointerEvents: "auto",
            },
          ]}
        >
          <CopilotStep
            text="Welcome! Tap the menu button (☰) to open the sidebar. You'll see navigation options like Explore, Wallet, Notifications, Profile, and Settings."
            order={1}
            name="menuButton"
          >
            <View style={{ position: "relative" }}>
              <CopilotTouchableOpacity
                onPress={() =>
                  openDashboardDrawerFromHeader(navigationFromContext)
                }
                style={styles.headerIconButton}
                activeOpacity={0.8}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                // Make sure this is clickable even during tutorial
              >
                <Ionicons
                  name="menu"
                  size={26}
                  color={isDark ? "#FFFFFF" : "#000000"}
                />
              </CopilotTouchableOpacity>
            </View>
          </CopilotStep>

          <View pointerEvents="box-none" style={styles.headerLogoContainer}>
            <TouchableOpacity
              onPress={() => headerRouter.replace("./explore?reset=1" as any)}
              style={styles.headerLogoButton}
              activeOpacity={0.8}
            >
              <Image
                source={
                  isDark
                    ? require("../../../assets/logos/hashpass/logo-full-hashpass-white-cyan.webp")
                    : require("../../../assets/logos/hashpass/logo-full-hashpass-white.webp")
                }
                style={styles.headerLogoImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <CopilotStep
              text="Tap the notifications icon to view your recent notifications. The red badge shows the number of unread notifications. You can also access the full notifications screen from the sidebar."
              order={10}
              name="notificationsButton"
            >
              <CopilotView>
                <MiniNotificationDropdown />
              </CopilotView>
            </CopilotStep>
            <CopilotStep
              text="Tap the QR code scanner to scan QR codes for event check-ins, networking, or accessing event features."
              order={11}
              name="qrScannerButton"
            >
              <CopilotTouchableOpacity
                onPress={() => setQrScannerVisible(true)}
                style={styles.headerIconButton}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="qr-code-outline"
                  size={26}
                  color={isDark ? "#FFFFFF" : "#000000"}
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
              console.error("QR Scan Error:", error);
              // Error is already shown in the scanner component
            }}
            onRawScan={async (data: string) => {
              const parsed = parseAuthQrScan(data);
              if (parsed) {
                setQrScannerVisible(false);
                headerRouter.push({
                  pathname: "./auth-qr-approve",
                  params: { challengeId: parsed.challengeId },
                } as any);
                return true;
              }
              const handled = await handleHashpassRawScan(data);
              if (handled) setQrScannerVisible(false);
              return handled;
            }}
          />
        )}
      </RNAnimated.View>
    );
  };

  // Screen component with header
  const ScreenWithHeader = () => {
    return (
      <View
        pointerEvents="auto"
        style={[
          styles.headerContainer,
          {
            height: ANDROID_DASHBOARD_HEADER_HEIGHT,
            backgroundColor: isDark
              ? "rgba(18, 18, 18, 0.95)"
              : "rgba(255, 255, 255, 0.95)",
            zIndex: 1000,
          },
        ]}
      >
        <SystemBars style={isDark ? "light" : "dark"} />
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
    if (Platform.OS !== "android") {
      return customDrawerHeaderOptions;
    }

    return {
      headerShown: true,
      headerTitleAlign: "center" as const,
      headerTintColor: isDark ? "#FFFFFF" : "#000000",
      headerStyle: {
        height: ANDROID_DASHBOARD_HEADER_HEIGHT,
        backgroundColor: isDark
          ? "rgba(18, 18, 18, 0.95)"
          : "rgba(255, 255, 255, 0.95)",
      },
      headerShadowVisible: true,
      headerLeftContainerStyle: styles.nativeHeaderLeftContainer,
      headerRightContainerStyle: styles.nativeHeaderRightContainer,
      headerTitle: () => (
        <TouchableOpacity
          onPress={() => router.replace("./explore?reset=1" as any)}
          style={styles.headerLogoButton}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Explore events"
        >
          <Image
            source={
              isDark
                ? require("../../../assets/logos/hashpass/logo-full-hashpass-white-cyan.webp")
                : require("../../../assets/logos/hashpass/logo-full-hashpass-white.webp")
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
            <MorphIcon
              ref={headerMenuIconRef}
              icon={drawerOpenRef.current ? LucideX : LucideMenu}
              size={26}
              color={isDark ? "#FFFFFF" : "#000000"}
              fallbackIconName="menu"
              spring="snappy"
            />
          </CopilotTouchableOpacity>
        </CopilotStep>
      ),
      headerRight: () => (
        <View style={styles.nativeHeaderRight}>
          <CopilotStep
            text="Tap the notifications icon to view your recent notifications. The red badge shows the number of unread notifications. You can also access the full notifications screen from the sidebar."
            order={10}
            name="notificationsButton"
          >
            <CopilotView style={styles.nativeHeaderActionSlot}>
              <MiniNotificationDropdown />
            </CopilotView>
          </CopilotStep>
          <CopilotStep
            text="Tap the QR code scanner to scan QR codes for event check-ins, networking, or accessing event features."
            order={11}
            name="qrScannerButton"
          >
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
                color={isDark ? "#FFFFFF" : "#000000"}
              />
            </CopilotTouchableOpacity>
          </CopilotStep>
        </View>
      ),
    };
  };

  // Defense in depth: a definitively-unauthenticated visitor (auth has
  // finished loading, isLoggedIn is false, and there's no recent-auth grace
  // window that could mean this is just a transient provider flap on a real
  // session -- see hasRecentAuthSuccess() above) must never see dashboard
  // content rendered, even briefly. This intentionally does NOT change the
  // redirect timer above: that delay exists to avoid force-unmounting mid
  // render during a genuine transient flap (a real native Android crash),
  // and still fires on its own schedule. This only swaps what's on screen
  // while that timer is pending, for the case where there's nothing
  // ambiguous to protect -- no real session was ever detected here.
  if (
    !authLoading &&
    !isLoggedIn &&
    !hasRecentAuthSuccess() &&
    !isDevAuthBypassEnabled()
  ) {
    return <LoadingScreen icon="dashboard" fullScreen />;
  }

  return (
    <AnimationProvider>
      <DiscoveryScopeProvider>
        <NotificationProvider>
          <ScrollProvider>
            <View style={{ flex: 1 }}>
              <Drawer
                openControlRef={drawerOpenControlRef}
                drawerContent={renderDrawerContent}
                screenOptions={({ navigation }) => ({
                  ...getDrawerHeaderOptions(navigation),
                  drawerType: "front",
                  drawerStyle: dashboardDrawerStyle,
                  overlayColor: "rgba(0,0,0,0.5)",
                  drawerPosition: "left",
                  // Native edge swipes can dispatch a second drawer transition
                  // while the current slide is settling. Keep the deterministic
                  // burger and backdrop close paths on Android/iOS.
                  swipeEnabled: Platform.OS === "web",
                })}
              >
                <Drawer.Screen name="explore" />
                <Drawer.Screen name="contacts" />
                <Drawer.Screen name="notifications" />
                <Drawer.Screen name="business-invites" />
                <Drawer.Screen name="wallet" />
                <Drawer.Screen name="profile" />
                <Drawer.Screen name="settings" />
                <Drawer.Screen name="admin" />
                <Drawer.Screen name="qr-view" />
                <Drawer.Screen name="pass-details" />
                <Drawer.Screen name="auth-qr-approve" />
              </Drawer>
              {Platform.OS === "android" && (
                <QRScanner
                  visible={androidQrScannerVisible}
                  onClose={() => setAndroidQrScannerVisible(false)}
                  onScanSuccess={(result: unknown) => {
                    setAndroidQrScannerVisible(false);
                  }}
                  onScanError={(error: unknown) => {
                    console.error("QR Scan Error:", error);
                  }}
                  onRawScan={async (data: string) => {
                    const parsed = parseAuthQrScan(data);
                    if (parsed) {
                      setAndroidQrScannerVisible(false);
                      router.push({
                        pathname: "./auth-qr-approve",
                        params: { challengeId: parsed.challengeId },
                      } as any);
                      return true;
                    }
                    const handled = await handleHashpassRawScan(data);
                    if (handled) setAndroidQrScannerVisible(false);
                    return handled;
                  }}
                />
              )}
              {(hashpassQrResult || hashpassQrError) && (
                <Modal
                  visible
                  transparent
                  animationType="fade"
                  onRequestClose={() => {
                    setHashpassQrResult(null);
                    setHashpassQrError(null);
                  }}
                >
                  <View style={styles.qrResultBackdrop}>
                    <View style={styles.qrResultCard}>
                      <Text style={styles.qrResultTitle}>
                        {hashpassQrError
                          ? "QR unavailable"
                          : hashpassQrResult?.valid
                            ? "HashPass identified"
                            : "QR not valid"}
                      </Text>
                      <Text style={styles.qrResultMessage}>
                        {hashpassQrError || hashpassQrResult?.message}
                      </Text>
                      {hashpassQrResult?.user && (
                        <Text style={styles.qrResultDetail}>
                          User: {hashpassQrResult.user.name || hashpassQrResult.user.username || hashpassQrResult.user.id}
                        </Text>
                      )}
                      {hashpassQrResult?.pass && (
                        <Text style={styles.qrResultDetail}>
                          Pass: {hashpassQrResult.pass.number || hashpassQrResult.pass.id} · {hashpassQrResult.pass.type?.toUpperCase() || "UNKNOWN"}
                        </Text>
                      )}
                      {hashpassQrResult?.network && (
                        <Text style={styles.qrResultDetail}>Network: {hashpassQrResult.network}</Text>
                      )}
                      {hashpassQrResult?.address && (
                        <Text selectable style={styles.qrResultDetail}>Address: {hashpassQrResult.address}</Text>
                      )}
                      <TouchableOpacity
                        style={styles.qrResultClose}
                        accessibilityRole="button"
                        onPress={() => {
                          setHashpassQrResult(null);
                          setHashpassQrError(null);
                        }}
                      >
                        <Text style={styles.qrResultCloseText}>Done</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Modal>
              )}
            </View>
          </ScrollProvider>
        </NotificationProvider>
      </DiscoveryScopeProvider>
    </AnimationProvider>
  );
}

const getStyles = (
  isDark: boolean,
  colors: any,
  isMobile: boolean,
  insets: DashboardDrawerInsets = {},
) => {
  const drawerSafeInsets = getDashboardDrawerInsets(insets);
  // One horizontal inset for the profile card, nav rows, divider and quick
  // actions keeps every block in the drawer on the same symmetric grid.
  const drawerInset = isMobile ? 16 : 14;
  const drawerSoftShadow = isDark
    ? "0 6px 16px rgba(0, 0, 0, 0.30)"
    : "0 6px 16px rgba(20, 20, 30, 0.08)";
  const brandRed = uiTokens.colors.light.accent;

  return StyleSheet.create({
    qrResultBackdrop: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      backgroundColor: uiTokens.colors[isDark ? "dark" : "light"].overlay,
    },
    qrResultCard: {
      width: "100%",
      maxWidth: 440,
      borderRadius: uiTokens.radius.card,
      padding: 24,
      backgroundColor: colors.background.default,
      borderWidth: 1,
      borderColor: colors.divider,
      gap: 10,
    },
    qrResultTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.text.primary,
    },
    qrResultMessage: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.text.primary,
    },
    qrResultDetail: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.text.secondary,
    },
    qrResultClose: {
      alignSelf: "flex-end",
      marginTop: 8,
      borderRadius: uiTokens.radius.pill,
      paddingHorizontal: 20,
      paddingVertical: 12,
      backgroundColor: colors.primary,
    },
    qrResultCloseText: {
      color: colors.background.default,
      fontWeight: "700",
    },
    container: {
      flex: 1,
      backgroundColor: colors.background.default,
    },
    headerContainer: {
      backgroundColor: "transparent",
      zIndex: 1000,
    },
    header: {
      left: 0,
      right: 0,
      zIndex: 1000,
      height: ANDROID_DASHBOARD_HEADER_HEIGHT,
      backgroundColor: "transparent",
      borderBottomWidth: 1,
      borderBottomColor: isDark
        ? "rgba(255, 255, 255, 0.1)"
        : "rgba(0, 0, 0, 0.1)",
    },
    headerContent: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 8,
      height: "100%",
    },
    headerButton: {
      padding: 12,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark
        ? "rgba(255, 255, 255, 0.12)"
        : "rgba(0, 0, 0, 0.08)",
      boxShadow: isDark
        ? "0 6px 12px rgba(0, 0, 0, 0.28)"
        : "0 6px 12px rgba(15, 23, 42, 0.12)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.08)",
    },
    headerIconButton: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    headerLogoContainer: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
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
      alignItems: "center",
      justifyContent: "center",
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
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 8,
      width: 112,
    },
    nativeHeaderActionSlot: {
      width: 52,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    drawerHeader: {
      paddingTop: 14 + drawerSafeInsets.top,
      paddingBottom: 16,
      paddingHorizontal: 16,
      backgroundColor: isDark
        ? uiTokens.colors.dark.canvas
        : uiTokens.colors.light.canvas,
      position: "relative",
      overflow: "hidden",
    },
    drawerDivider: {
      height: 1,
      marginStart: drawerInset + drawerSafeInsets.left,
      marginEnd: drawerInset + drawerSafeInsets.right,
      backgroundColor: isDark
        ? "rgba(255, 255, 255, 0.07)"
        : "rgba(0, 0, 0, 0.06)",
    },
    drawerTopBar: {
      height: 36,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      position: "relative",
      zIndex: 2,
    },
    drawerBrandButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 36,
      paddingRight: 8,
    },
    drawerBrandLogo: {
      width: 88,
      height: 22,
    },
    profileCard: {
      marginTop: 12,
      padding: isMobile ? 12 : 14,
      borderRadius: uiTokens.radius.card,
      backgroundColor: isDark ? "#1c1716" : "#fbf3f2",
      position: "relative",
      zIndex: 1,
      boxShadow: isDark
        ? "0 12px 24px rgba(0, 0, 0, 0.20)"
        : "0 12px 24px rgba(175, 13, 1, 0.08)",
    },
    profileAvatarButton: {
      flexShrink: 0,
    },
    profileUsernameButton: {
      alignSelf: "flex-start",
      maxWidth: "100%",
    },
    profileChevronButton: {
      width: 32,
      height: 32,
      flexShrink: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    profileIdentityRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    profileAvatarShell: {
      width: isMobile ? 56 : 64,
      height: isMobile ? 56 : 64,
      flexShrink: 0,
      position: "relative",
      padding: 3,
      borderRadius: uiTokens.radius.circle,
      backgroundColor: brandRed,
    },
    profileAvatar: {
      width: "100%",
      height: "100%",
      borderRadius: uiTokens.radius.circle,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      borderWidth: 3,
      borderColor: isDark ? "#1c1716" : "#fbf3f2",
      backgroundColor: isDark ? "#2a2220" : "#f1dcd9",
    },
    profileAvatarAction: {
      position: "absolute",
      right: -2,
      bottom: -2,
      width: 28,
      height: 28,
      borderRadius: uiTokens.radius.circle,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: brandRed,
      borderWidth: 2,
      borderColor: isDark ? "#1c1716" : "#fbf3f2",
    },
    profileCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    profileUsername: {
      fontSize: isMobile ? 17 : 19,
      lineHeight: isMobile ? 20 : 22,
      fontWeight: "800",
      letterSpacing: -0.2,
      color: colors.text.primary,
    },
    profileEmail: {
      fontSize: 12,
      lineHeight: 16,
      color: colors.text.secondary,
    },
    profileMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      marginTop: 2,
      minWidth: 0,
    },
    profileBrandBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: uiTokens.radius.circle,
      overflow: "hidden",
      backgroundColor: brandRed,
      color: uiTokens.colors.light.onAccent,
      fontSize: 9,
      lineHeight: 11,
      fontWeight: "800",
      letterSpacing: 0.8,
    },
    profileMemberSince: {
      flexShrink: 1,
      fontSize: 11,
      lineHeight: 14,
      color: colors.text.secondary,
    },
    profileMemberSinceExpanded: {
      marginTop: 8,
      fontSize: 12,
      lineHeight: 16,
      color: colors.text.secondary,
    },
    profileStatsRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 12,
    },
    profileStat: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 8,
      paddingHorizontal: 8,
      borderRadius: uiTokens.radius.input,
      backgroundColor: isDark
        ? uiTokens.colors.dark.raised
        : uiTokens.colors.light.raised,
      boxShadow: drawerSoftShadow,
    },
    profileStatValue: {
      fontSize: 16,
      lineHeight: 19,
      fontWeight: "800",
    },
    profileStatLabel: {
      marginTop: 3,
      fontSize: 9,
      lineHeight: 11,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    gradientBackground: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: 0,
    },
    fluidGradientLayer: {
      position: "absolute",
      width: 400,
      height: 400,
      borderRadius: 200, // Circular shape
      top: "50%",
      left: "50%",
      marginTop: -200,
      marginLeft: -200,
      zIndex: 0,
    },
    drawerCloseButton: {
      width: 36,
      height: 36,
      borderRadius: uiTokens.radius.circle,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "rgba(255, 255, 255, 0.08)" : "#f5f5f7",
      boxShadow: drawerSoftShadow,
    },
    menuItemsScrollView: {
      flex: 1,
    },
    menuItemsContent: {
      paddingTop: 12,
      paddingBottom: 12,
      paddingStart: drawerInset + drawerSafeInsets.left,
      paddingEnd: drawerInset + drawerSafeInsets.right,
      flexGrow: 1,
    },
    menuSectionLabel: {
      paddingHorizontal: 8,
      paddingTop: 2,
      paddingBottom: 8,
      fontSize: 10,
      lineHeight: 13,
      fontWeight: "800",
      letterSpacing: 1.5,
      color: colors.text.secondary,
      textTransform: "uppercase",
    },
    menuItems: {
      flex: 1,
      paddingTop: 24,
      paddingBottom: 16,
      paddingHorizontal: 16,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 46,
      paddingVertical: 4,
      paddingRight: 12,
      paddingLeft: 8,
      marginVertical: 1,
      borderRadius: uiTokens.radius.input,
    },
    menuIconContainer: {
      width: 32,
      height: 32,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    menuText: {
      fontSize: 15,
      color: colors.text.primary,
      flex: 1,
      letterSpacing: 0.1,
    },
    menuBadge: {
      backgroundColor: "#FF3B30",
      borderRadius: uiTokens.radius.small,
      paddingHorizontal: 7,
      paddingVertical: 2,
      minWidth: 22,
      height: 18,
      justifyContent: "center",
      alignItems: "center",
      marginLeft: 8,
    },
    menuBadgeText: {
      color: uiTokens.colors.light.onAccent,
      fontSize: 10,
      fontWeight: "700",
    },
    logoutAction: {
      flex: 1.15,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: 12,
      borderRadius: uiTokens.radius.input,
      marginTop: 0,
      backgroundColor: isDark
        ? "rgba(255, 59, 48, 0.1)"
        : "rgba(255, 59, 48, 0.05)",
      boxShadow: drawerSoftShadow,
      gap: 10,
    },
    logoutActionText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.error.main,
    },
    quickSettingsSection: {
      paddingTop: 12,
      paddingBottom: 12,
      paddingStart: drawerInset + drawerSafeInsets.left,
      paddingEnd: drawerInset + drawerSafeInsets.right,
    },
    quickTogglesRow: {
      flexDirection: "row",
      alignItems: "stretch",
      width: "100%",
      gap: 8,
    },
    quickToggleButton: {
      minWidth: 0,
      minHeight: 48,
      borderRadius: uiTokens.radius.input,
      justifyContent: "center",
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      boxShadow: drawerSoftShadow,
      backgroundColor: colors.background.paper,
      gap: 8,
    },
    languageToggleButton: {
      flex: 1,
    },
    themeToggleButton: {
      width: 50,
      paddingHorizontal: 0,
    },
    quickToggleButtonDisabled: {
      opacity: 0.72,
    },
    quickToggleLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
      textAlign: "left",
      flexShrink: 1,
      minWidth: 0,
    },
    visuallyHiddenLabel: {
      position: "absolute",
      width: 1,
      height: 1,
      opacity: 0,
    },
    mainContent: {
      flex: 1,
      paddingTop: 80, // Space for the header
      backgroundColor: colors.background.default,
    },
    logo: {
      width: isMobile ? 90 : 120,
      height: isMobile ? 90 : 120,
    },
  });
};
