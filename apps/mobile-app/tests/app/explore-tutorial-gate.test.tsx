/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Regression coverage for the post-auth dashboard freeze: the Copilot
 * compatibility layer is deliberately disabled, so the Explore screen must
 * not perform any tutorial work even if the signed-in user's preferences say
 * a tutorial should begin. Keeping this as a component-level test protects
 * the early returns in the screen effects rather than only testing the shim.
 */

const shouldShowTutorial = jest.fn(() => true);
const copilotEvents = {
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
};
const runAfterInteractions = jest.fn();

const noEventTheme = {
  background: {
    default: '#ffffff',
    paper: '#ffffff',
  },
  text: {
    primary: '#111827',
    secondary: '#4b5563',
  },
};

function loadExploreScreen(availableEvents: Array<Record<string, unknown>> = []) {
  let React: typeof import('react');
  let TestRenderer: typeof import('react-test-renderer');
  let ExploreScreen: React.ComponentType;

  jest.isolateModules(() => {
    jest.resetModules();

    jest.doMock('react-native', () => ({
      AccessibilityInfo: {
        addEventListener: jest.fn(),
        isReduceMotionEnabled: () => Promise.resolve(false),
      },
      Appearance: {
        getColorScheme: () => 'light',
        addChangeListener: jest.fn(),
      },
      AppState: {
        currentState: 'active',
        addEventListener: jest.fn(() => ({ remove: jest.fn() })),
      },
      Animated: {
        event: jest.fn(() => jest.fn()),
        ScrollView: 'Animated.ScrollView',
      },
      Image: 'Image',
      InteractionManager: {
        runAfterInteractions,
      },
      Platform: {
        OS: 'web',
      },
      ScrollView: 'ScrollView',
      StatusBar: {
        currentHeight: 0,
      },
      StyleSheet: {
        create: (styles: unknown) => styles,
      },
      Text: 'Text',
      TouchableOpacity: 'TouchableOpacity',
      View: 'View',
      useWindowDimensions: () => ({ width: 1024, height: 768 }),
    }));

    jest.doMock(
      'react-native-css-interop/src/runtime/native/appearance-observables',
      () => ({
        addChangeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeChangeListener: jest.fn(),
        removeEventListener: jest.fn(),
        resetAppearanceListeners: jest.fn(),
      }),
      { virtual: true },
    );
    // The screen uses the nativewind automatic JSX runtime. This unit test
    // renders only the screen's no-event branch, so React's plain runtime is
    // sufficient and avoids initializing native style observables.
    jest.doMock('react-native-css-interop/jsx-runtime', () =>
      require('react/jsx-runtime'),
    );

    jest.doMock('react-native-reanimated', () => ({
      __esModule: true,
      default: {
        View: 'Reanimated.View',
      },
    }));

    jest.doMock('expo-router', () => ({
      useLocalSearchParams: () => ({}),
      useRouter: () => ({ push: jest.fn() }),
    }));
    jest.doMock('@lingui/macro', () => ({
      t: ({ message }: { message: string }) => message,
    }));
    jest.doMock('@lingui/core', () => ({
      _: ({ message }: { message: string }) => message,
      i18n: {
        _: ({ message }: { message: string }) => message,
      },
    }));
    jest.doMock('@contexts/ScrollContext', () => ({
      useScroll: () => ({ scrollY: {}, headerHeight: 0 }),
    }));
    jest.doMock('@contexts/EventContext', () => ({
      useEvent: () => ({ event: null }),
    }));
    jest.doMock('../../hooks/useTheme', () => ({
      useTheme: () => ({ isDark: false, colors: noEventTheme }),
    }));
    jest.doMock('../../hooks/useAuth', () => ({
      useAuth: () => ({ isLoggedIn: true, isLoading: false }),
    }));
    jest.doMock('../../hooks/useTutorialPreferences', () => ({
      useTutorialPreferences: () => ({
        shouldShowTutorial,
        markTutorialCompleted: jest.fn(),
        updateTutorialStep: jest.fn(),
        isReady: true,
        mainTutorialCompleted: false,
        mainTutorialProgress: null,
      }),
    }));
    jest.doMock('../../hooks/useHorizontalScrollArrows', () => ({
      useHorizontalScrollArrows: () => ({}),
    }));
    jest.doMock('../../lib/event-detector', () => ({
      getAvailableEvents: () => availableEvents,
      getCurrentEvent: (eventId?: string) =>
        availableEvents.find((event) => event.id === eventId) || null,
      getEventQuickAccessItems: () => [],
      isMainBranch: false,
      shouldShowEventSelector: () => false,
    }));
    jest.doMock('../../lib/event-branding', () => ({
      getSelectEventCardWatermark: () => 1,
    }));
    jest.doMock('../../lib/vector-icons', () => ({
      MaterialIcons: 'MaterialIcons',
    }));
    jest.doMock('@lib/copilot-shim', () => ({
      COPILOT_TUTORIALS_ENABLED: false,
      CopilotStep: ({ children }: { children: React.ReactNode }) => children,
      walkthroughable: (Component: React.ComponentType) => Component,
      useCopilot: () => ({
        start: jest.fn(() => false),
        copilotEvents,
      }),
    }));
    jest.doMock('../../components/EventBanner', () => 'EventBanner');
    jest.doMock('../../components/PassesDisplay', () => 'PassesDisplay');

    React = require('react');
    TestRenderer = require('react-test-renderer');
    ExploreScreen = require('../../app/(shared)/dashboard/explore').default;
  });

  return { React: React!, TestRenderer: TestRenderer!, ExploreScreen: ExploreScreen! };
}

describe('ExploreScreen disabled tutorial gate', () => {
  beforeEach(() => {
    shouldShowTutorial.mockClear();
    copilotEvents.on.mockClear();
    copilotEvents.off.mockClear();
    runAfterInteractions.mockClear();
  });

  it('does no tutorial work for a ready, logged-in user whose tutorial should start', async () => {
    const { React, TestRenderer, ExploreScreen } = loadExploreScreen();
    let renderer: import('react-test-renderer').ReactTestRenderer;

    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(React.createElement(ExploreScreen));
    });

    expect(shouldShowTutorial).not.toHaveBeenCalled();
    expect(copilotEvents.on).not.toHaveBeenCalled();
    expect(copilotEvents.off).not.toHaveBeenCalled();
    expect(runAfterInteractions).not.toHaveBeenCalled();

    await TestRenderer.act(async () => {
      renderer!.unmount();
    });
  });

  it('labels Quick Access with the currently selected event', async () => {
    const { React, TestRenderer, ExploreScreen } = loadExploreScreen([
      {
        id: 'chile2026',
        title: 'BSL Chile 2026',
        subtitle: 'Santiago, Chile',
        color: '#FF5B5B',
      },
    ]);
    let renderer: import('react-test-renderer').ReactTestRenderer;

    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(React.createElement(ExploreScreen));
    });

    expect(JSON.stringify(renderer!.toJSON())).toContain('For BSL Chile 2026');

    await TestRenderer.act(async () => {
      renderer!.unmount();
    });
  });
});
