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

  it('does not attach dashboard quick-access onLayout on Android', () => {
    const source = readSource('../../app/(shared)/dashboard/explore.tsx');

    expect(source).toContain("onLayout={Platform.OS === 'android' ? undefined : handleQuickAccessLayout}");
    expect(source).toContain("if (Platform.OS === 'android' && viewportWidthRef.current <= 0)");
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

    expect(logoSource).toContain('logo-full-hashpass-black.png');
    expect(dashboardSource).toContain("require('../../../assets/logos/hashpass/logo-full-hashpass-white.png')");
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

  it('adds an explicit swipe-to-close gesture on the drawer body', () => {
    const dashboardSource = readSource('../../app/(shared)/dashboard/_layout.tsx');

    expect(dashboardSource).toContain("import { Gesture, GestureDetector } from 'react-native-gesture-handler';");
    expect(dashboardSource).toContain('Gesture.Pan()');
    expect(dashboardSource).toContain('<GestureDetector gesture={swipeToCloseGesture}>');
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
