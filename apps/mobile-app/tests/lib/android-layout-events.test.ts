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
