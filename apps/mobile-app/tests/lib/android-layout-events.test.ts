/// <reference types="jest" />

import fs from 'fs';
import path from 'path';

const readSource = (relativePath: string) =>
  fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

describe('Android layout event crash guards', () => {
  it('does not attach landing page onLayout handlers on Android', () => {
    const source = readSource('../../app/home.tsx');

    expect(source).toContain('onLayout={Platform.OS === "android" ? undefined : handleInitialScrollLayout}');
    expect(source).toContain('Platform.OS === "android"');
    expect(source).toContain('featuresLayoutRef.current = { y };');
  });

  it('does not attach dashboard quick-access/select-event onLayout on Android', () => {
    const source = readSource('../../app/(shared)/dashboard/explore.tsx');
    // Both horizontal scroll rows in this screen (Quick Access, Select Event)
    // share the useHorizontalScrollArrows hook, which owns the actual
    // Android viewportWidthRef fallback guard (checked below).
    const hookSource = readSource('../../hooks/useHorizontalScrollArrows.ts');

    expect(source).toContain("onLayout={Platform.OS === 'android' ? undefined : quickAccessScroll.handleLayout}");
    expect(source).toContain("onLayout={Platform.OS === 'android' ? undefined : eventSelectorScroll.handleLayout}");
    expect(hookSource).toContain("if (Platform.OS === 'android' && viewportWidthRef.current <= 0 && androidFallbackWidth)");
  });

  it('does not attach dashboard scroll-card onLayout handlers on Android', () => {
    const hashPointsSource = readSource('../../components/HashPointsView.tsx');
    const blockchainTokensSource = readSource('../../components/BlockchainTokensView.tsx');
    const quickAccessGridSource = readSource('../../components/explorer/QuickAccessGrid.tsx');

    expect(hashPointsSource).toContain("onLayout={Platform.OS === 'android' ? undefined : handleLayout}");
    expect(blockchainTokensSource).toContain("onLayout={Platform.OS === 'android' ? undefined : handleLayout}");
    expect(quickAccessGridSource).toContain("onLayout={Platform.OS === 'android' ? undefined : handleLayout}");
  });

  it('uses the black full HASHPASS logo on light native landing surfaces', () => {
    const logoSource = readSource('../../lib/hashpass-logo.ts');
    const dashboardSource = readSource('../../app/(shared)/dashboard/_layout.tsx');

    expect(logoSource).toContain('logo-full-hashpass-black.webp');
    expect(dashboardSource).toContain("require('../../../assets/logos/hashpass/logo-full-hashpass-white.webp')");
  });

  it('routes native post-auth dashboard navigation through the shared route group', () => {
    const authSource = readSource('../../app/(shared)/auth.tsx');
    const homeSource = readSource('../../app/home.tsx');

    expect(authSource).toContain('const DASHBOARD_EXPLORE_PUBLIC_PATH = "/dashboard/explore";');
    expect(authSource).toContain('const DASHBOARD_EXPLORE_ROUTER_PATH = "/(shared)/dashboard/explore";');
    expect(authSource).toContain('router.replace(routerRedirectPath as any);');
    expect(authSource).toContain('return <Redirect href={routerRedirectPath as any} />;');
    expect(homeSource).toContain('router.replace("/(shared)/dashboard/explore" as any);');
  });

  it('keeps native OTP autofill from leaving stale text in the first digit cell', () => {
    const authSource = readSource('../../app/(shared)/auth.tsx');

    expect(authSource).toContain('const [otpCell0RemountKey, setOtpCell0RemountKey] = useState(0);');
    expect(authSource).toContain('setOtpCell0RemountKey((k) => k + 1);');
    expect(authSource).toContain('`otp-input-${key}-${otpCell0RemountKey}`');
    expect(authSource).toContain('`otp-input-${key}`');
    expect(authSource).toContain('maxLength={index === 0 ? OTP_CODE_LENGTH : 1}');
    expect(authSource).toContain('index === 0 ? "oneTimeCode" : undefined');
  });

  it('keeps the native dashboard drawer clear of Android system edges', () => {
    const dashboardSource = readSource('../../app/(shared)/dashboard/_layout.tsx');

    expect(dashboardSource).toContain('const ANDROID_DRAWER_BOTTOM_GUARD = 56;');
    expect(dashboardSource).toContain('Platform.OS !== \'web\' && isMobile');
    expect(dashboardSource).toContain('width: dashboardDrawerWidth');
    expect(dashboardSource).toContain('bottomInset={drawerSafeInsets.bottom}');
  });

  it('keeps a stable drawerStyle reference so the open/close animation is not re-targeted mid-transition', () => {
    // Regression for: opening the drawer looked like it stopped at an
    // intermediate width (~40%) on the first tap and needed a second tap to
    // reach the full 80%; closing showed the same two-tap symptom in reverse.
    // `drawerStyle` was previously a brand-new `{ width: dashboardDrawerWidth }`
    // object literal built inline inside the unmemoized `screenOptions`
    // callback, so it got a new identity on every DashboardLayout re-render —
    // including the several that happen while the drawer is mid-transition.
    // React Navigation's Drawer derives its animation target from
    // `options.drawerStyle`; a reference change mid-flight can re-target an
    // in-progress animation from wherever it currently sits. Memoizing both
    // the width value and the wrapper object keeps that reference stable
    // across renders that don't actually change the width.
    const dashboardSource = readSource('../../app/(shared)/dashboard/_layout.tsx');

    expect(dashboardSource).toContain('const dashboardDrawerWidth = useMemo<DimensionValue>(');
    expect(dashboardSource).toContain('const dashboardDrawerStyle = useMemo(');
    expect(dashboardSource).toContain('() => ({ width: dashboardDrawerWidth }),');
    expect(dashboardSource).toContain('drawerStyle: dashboardDrawerStyle,');
  });

  it('navigates drawer menu items by screen name and auto-collapses on route change', () => {
    // Regression for two live-reproduced bugs: (1) tapping a menu item did not
    // change the tab behind it — router.push('./wallet') from the drawer
    // content's route context resolved inconsistently and was frequently a
    // silent no-op; navigate by unambiguous screen name instead. (2) The
    // sidebar did not auto-collapse on tab change — closing it inline was
    // overridden by the async navigation update, so the reliable close lives in
    // an effect keyed on pathname (fires after the route actually changes).
    const dashboardSource = readSource('../../app/(shared)/dashboard/_layout.tsx');
    const handleNavigationSource = dashboardSource.slice(
      dashboardSource.indexOf('const handleNavigation ='),
      dashboardSource.indexOf('const handleLogout =')
    );

    expect(handleNavigationSource).toContain("const screenName = route.replace('./', '');");
    expect(handleNavigationSource).toContain('navigation.navigate(screenName);');
    expect(handleNavigationSource).not.toContain('router.push(route)');
    // Auto-collapse effect keyed on pathname. Closes via setDrawerOpen (the
    // openControlRef-backed helper — see the "uses one drawer gesture owner"
    // test below), not a direct dispatch, so this is keyed on setDrawerOpen.
    expect(dashboardSource).toContain('const previousPathnameRef = useRef(pathname);');
    expect(dashboardSource).toContain('}, [pathname, setDrawerOpen]);');
  });

  it('routes dashboard drawer logout to the login screen after clearing the local session', () => {
    // Logout must clear the actual persisted session (see
    // SupabaseAuthProvider/BetterAuthProvider signOut fixes) and land on the
    // login screen, not silently do nothing and not leave a resurrectable
    // session behind for a later getSession() to pick back up.
    const dashboardSource = readSource('../../app/(shared)/dashboard/_layout.tsx');
    const handleLogoutSource = dashboardSource.slice(
      dashboardSource.indexOf('const handleLogout = async () => {'),
      dashboardSource.indexOf('const handleLanguageToggle')
    );

    expect(dashboardSource).toContain('const [isSigningOut, setIsSigningOut] = React.useState(false);');
    expect(dashboardSource).toContain('disabled={isSigningOut}');
    expect(handleLogoutSource).toContain('router.replace(\'/(shared)/auth\' as any);');
  });

  it('leaves a visible dimmed backdrop next to the open drawer instead of covering the full screen', () => {
    // Regression for: the drawer was set to Math.ceil(viewportWidth) (100%
    // of the screen) on native mobile. With no gap left over, there is
    // nothing for the drawer's own tap-outside-to-close overlay Pressable to
    // render on top of — there is no "outside" a user can tap, even though
    // the close handlers themselves are fine. Must be less than full width
    // so a dimmed, tappable area remains on the right.
    const dashboardSource = readSource('../../app/(shared)/dashboard/_layout.tsx');

    expect(dashboardSource).toContain('Math.ceil(viewportWidth * 0.8)');
  });

  it('only runs the drawer header gradient animations while the drawer is open', () => {
    // Regression for: these 4 infinite (-1) Reanimated animations ran for as
    // long as CustomDrawerContent stayed mounted, i.e. the whole time the
    // dashboard is open, not just the moments this decorative background is
    // actually visible — measured at a sustained ~65%+ CPU on an emulator
    // with the drawer merely left open and nothing being touched.
    const dashboardSource = readSource('../../app/(shared)/dashboard/_layout.tsx');

    expect(dashboardSource).toContain('if (decorativeAnimationsEnabled && drawerStatus === \'open\') {');
    expect(dashboardSource).toContain('}, [decorativeAnimationsEnabled, drawerStatus]);');
  });

  it('disables all decorative drawer animation on native, not just web-tuned gating', () => {
    // Regression for: the sidebar still felt slow to open/close on native even
    // after the gradient animations were gated to only run while open (test
    // above). The 4 gradient animations, the gradient layers themselves, and
    // the logo press-spring were all still running on native — competing with
    // the drawer's own open/close slide for UI-thread frame budget. Native now
    // opts out of all of it; the decoration is kept on web only, where it's
    // cheap and the slowness was never reported.
    const dashboardSource = readSource('../../app/(shared)/dashboard/_layout.tsx');

    expect(dashboardSource).toContain(
      "const decorativeAnimationsEnabled = animationsEnabled && Platform.OS === 'web';"
    );
    expect(dashboardSource).toContain('{decorativeAnimationsEnabled ? (');
    expect(dashboardSource).toContain("if (Platform.OS !== 'web') return;");
  });

  it('uses one drawer gesture owner so the close button or outside press always settles fully closed', () => {
    const dashboardSource = readSource('../../app/(shared)/dashboard/_layout.tsx');

    // react-native-drawer-layout already owns a whole-screen pan and outside
    // overlay. A second GestureDetector inside drawer content competed with
    // it, allowing the close transition to be left partially open.
    expect(dashboardSource).not.toContain('GestureDetector');
    expect(dashboardSource).not.toContain('DrawerActions.toggleDrawer()');
    // closeDrawer() is the one canonical close path (X button, menu-item
    // auto-collapse, logout, tutorial-forced close all route through it —
    // see the other tests in this file). It calls setDrawerOpen(false), not
    // navigation.dispatch()/closeDrawer() directly: on CI-built Android
    // artifacts only, dispatch() resolved without error but the resulting
    // navigation-state update never reached the mounted Drawer's render, so
    // the sidebar silently never opened/closed there (never reproduced from
    // any local build of identical source). setDrawerOpen drives the
    // patched @react-navigation/drawer's own openControlRef instead,
    // bypassing that broken pipeline.
    expect(dashboardSource).toContain('const closeDrawer = () => {\n    setDrawerOpen(false);\n  };');
    expect(dashboardSource).toContain('onPress={() => openDashboardDrawerFromHeader(navigation)}');
    expect(dashboardSource).toContain("id: 'nav.closeMenu', message: 'Close navigation menu'");
  });

  it('always forwards the first native hamburger tap to the drawer navigator', () => {
    const dashboardSource = readSource('../../app/(shared)/dashboard/_layout.tsx');
    const openDrawerSource = dashboardSource.slice(
      dashboardSource.indexOf('const openDashboardDrawer = useCallback'),
      dashboardSource.indexOf('const closeDashboardDrawer = useCallback')
    );

    // Regression for v1.8.258: a local "opening" transition lock could be
    // set before React Navigation handled the action, but never resolve on
    // some production Android devices. That made the first (and every later)
    // hamburger press a no-op. The navigator owns its transition state; the
    // header must always dispatch the initial open action.
    expect(dashboardSource).toContain("swipeEnabled: Platform.OS === 'web'");
    expect(dashboardSource).not.toContain('drawerTransitionRef');
    expect(openDrawerSource).toContain('const wasOpen = drawerOpenRef.current;');
    expect(openDrawerSource).toContain('const opened = openTargetedDashboardDrawer({');
    expect(openDrawerSource).toContain('openDrawerAction: DrawerActions.openDrawer(),');
    expect(openDrawerSource.indexOf('const opened = openTargetedDashboardDrawer({')).toBeLessThan(
      openDrawerSource.indexOf('if (wasOpen) {')
    );
  });

  it('always opens the native drawer from the hamburger instead of trusting stale drawer status', () => {
    // Regression for v1.8.259: on some Android devices the Drawer status ref
    // reported "open" while the drawer was visibly closed. Treating the
    // hamburger as a toggle then dispatched closeDrawer(), which appeared to
    // users as a dead menu button. The hamburger is now a one-way open action;
    // the drawer's close button/backdrop own the close path.
    const dashboardSource = readSource('../../app/(shared)/dashboard/_layout.tsx');

    expect(dashboardSource).toContain("import { openTargetedDashboardDrawer } from '../../../lib/dashboard-drawer';");
    expect(dashboardSource).toContain('const openDashboardDrawerFromHeader = useCallback');
    expect(dashboardSource).toContain('openDashboardDrawer(navigation);');
    expect(dashboardSource).toContain('onPress={() => openDashboardDrawerFromHeader(navigation)}');
    expect(dashboardSource).toContain('onPress={() => openDashboardDrawerFromHeader(navigationFromContext)}');
    expect(dashboardSource).not.toContain('onPress={() => toggleDashboardDrawer(navigation)}');
  });

  it('leaves the dashboard immediately while durable native session cleanup continues', () => {
    const dashboardSource = readSource('../../app/(shared)/dashboard/_layout.tsx');
    const authHookSource = readSource('../../hooks/useAuth.ts');
    const handleLogoutSource = dashboardSource.slice(
      dashboardSource.indexOf('const handleLogout = async () => {'),
      dashboardSource.indexOf('const handleLanguageToggle')
    );

    expect(handleLogoutSource).toContain('void signOut({ waitForRemoteCleanup: false }).catch((error: unknown) => {');
    expect(handleLogoutSource.indexOf('void signOut({ waitForRemoteCleanup: false }).catch((error: unknown) => {')).toBeLessThan(
      handleLogoutSource.indexOf("router.replace('/(shared)/auth' as any);")
    );
    expect(authHookSource).toContain("from '../lib/auth/native-session-clear'");
    expect(authHookSource).toContain('clearPersistedNativeProviderSessions()');
  });

  it('finishes native Google account cleanup before allowing a new login attempt', () => {
    const authHookSource = readSource('../../hooks/useAuth.ts');
    const signOutSource = authHookSource.slice(
      authHookSource.indexOf('const signOut = useCallback'),
      authHookSource.indexOf('const signIn = useCallback')
    );

    expect(signOutSource).toContain('const clearNativeGoogleBeforeNextLogin = async () =>');
    expect(signOutSource).toContain('const nativeGoogleCleanupPromise = clearNativeGoogleBeforeNextLogin();');
    expect(signOutSource.indexOf('const nativeGoogleCleanupPromise = clearNativeGoogleBeforeNextLogin();')).toBeLessThan(
      signOutSource.indexOf('const finishRemoteCleanup = async () =>')
    );
  });

  it('makes a new native Google login wait for an in-flight logout cleanup', () => {
    const authHookSource = readSource('../../hooks/useAuth.ts');
    const oauthSource = authHookSource.slice(
      authHookSource.indexOf('const signInWithOAuth = useCallback'),
      authHookSource.indexOf('const processOAuthCallback = useCallback')
    );

    expect(authHookSource).toContain('let nativeGoogleSignOutCleanup: Promise<void> | null = null;');
    expect(authHookSource).toContain('nativeGoogleSignOutCleanup = nativeGoogleCleanupPromise;');
    expect(oauthSource).toContain('await nativeGoogleSignOutCleanup;');
  });

  it('keeps safe-area Fabric events on the generated Fabric event name', () => {
    const fabricInsetsEventSource = readSource(
      '../../../../node_modules/react-native-safe-area-context/android/src/fabric/java/com/th3rdwave/safeareacontext/InsetsChangeEvent.kt',
    );
    const paperInsetsEventSource = readSource(
      '../../../../node_modules/react-native-safe-area-context/android/src/paper/java/com/th3rdwave/safeareacontext/InsetsChangeEvent.kt',
    );

    expect(fabricInsetsEventSource).toContain('const val EVENT_NAME = "insetsChange"');
    expect(fabricInsetsEventSource).not.toContain('const val EVENT_NAME = "topInsetsChange"');
    expect(paperInsetsEventSource).toContain('const val EVENT_NAME = "topInsetsChange"');
  });

  it('keeps React Native Screens Android events on generated Fabric event names', () => {
    const screensEvents: Record<string, string> = {
      HeaderAttachedEvent: 'attached',
      HeaderBackButtonClickedEvent: 'headerBackButtonClicked',
      HeaderDetachedEvent: 'detached',
      HeaderHeightChangeEvent: 'headerHeightChange',
      ScreenAppearEvent: 'appear',
      ScreenDisappearEvent: 'disappear',
      ScreenDismissedEvent: 'dismissed',
      ScreenTransitionProgressEvent: 'transitionProgress',
      ScreenWillAppearEvent: 'willAppear',
      ScreenWillDisappearEvent: 'willDisappear',
      SearchBarBlurEvent: 'searchBlur',
      SearchBarChangeTextEvent: 'changeText',
      SearchBarCloseEvent: 'close',
      SearchBarFocusEvent: 'searchFocus',
      SearchBarOpenEvent: 'open',
      SearchBarSearchButtonPressEvent: 'searchButtonPress',
      SheetDetentChangedEvent: 'sheetDetentChanged',
      StackFinishTransitioningEvent: 'finishTransitioning',
    };

    for (const [eventFile, eventName] of Object.entries(screensEvents)) {
      const source = readSource(
        `../../../../node_modules/react-native-screens/android/src/main/java/com/swmansion/rnscreens/events/${eventFile}.kt`,
      );

      expect(source).toContain(`const val EVENT_NAME = "${eventName}"`);
      expect(source).not.toContain('const val EVENT_NAME = "top');
    }
  });
});
