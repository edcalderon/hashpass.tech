/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */

const mockRouterPush = jest.fn();
const mockScrollTo = jest.fn();

const mockColors = {
  primary: "#c81000",
  primaryContrastText: "#ffffff",
  secondary: "#20242c",
  secondaryContrastText: "#ffffff",
  surface: "#ffffff",
  background: {
    default: "#ffffff",
  },
  text: {
    primary: "#121212",
    secondary: "#5f6678",
  },
};

const loadHomeScreen = ({
  width = 1200,
  height = 900,
  platform = "android",
  topInset = 0,
  bottomInset = 28,
  animationLevel = "reduced",
  isDark = false,
  taglineFlipList = "- YOUR EVENT -,- YOUR COMMUNITY -,- YOUR REWARDS -",
}: {
  width?: number;
  height?: number;
  platform?: "android" | "ios" | "web";
  topInset?: number;
  bottomInset?: number;
  animationLevel?: "full" | "reduced" | "none";
  isDark?: boolean;
  taglineFlipList?: string;
} = {}) => {
  let renderer: any;
  let actFn: any;
  let ReactRef: any;
  let HomeScreenRef: any;
  // Mutable so a test can simulate a mobile-browser toolbar collapse/expand
  // resize (useWindowDimensions changing) without remounting the screen.
  const dims = { width, height };

  jest.isolateModules(() => {
    jest.resetModules();
    mockScrollTo.mockReset();

    const React = require("react");

    const MockAnimatedValue = class {
      value: number;

      constructor(value: number) {
        this.value = value;
      }

      interpolate({ outputRange }: { outputRange: [any, any] }) {
        return outputRange[0];
      }
    };

    const mockAnimation = (
      value: { value?: number },
      config: { toValue?: number },
    ) => ({
      start: (callback?: () => void) => {
        if (typeof config.toValue === "number") {
          value.value = config.toValue;
        }

        callback?.();
      },
    });

    const MockReanimatedScrollView = React.forwardRef(
      (props: any, ref: any) => {
        React.useImperativeHandle(ref, () => ({
          scrollTo: mockScrollTo,
        }));

        return React.createElement(
          "Reanimated.ScrollView",
          props,
          props.children,
        );
      },
    );
    MockReanimatedScrollView.displayName = "MockReanimatedScrollView";

    jest.doMock("react-native", () => ({
      Animated: {
        Value: MockAnimatedValue,
        View: "Animated.View",
        Text: "Animated.Text",
        spring: (value: any, config: any) => mockAnimation(value, config),
        timing: (value: any, config: any) => mockAnimation(value, config),
      },
      Appearance: {
        getColorScheme: () => "light",
        addEventListener: jest.fn(() => ({ remove: jest.fn() })),
        removeEventListener: jest.fn(),
        addChangeListener: jest.fn(() => ({ remove: jest.fn() })),
        removeChangeListener: jest.fn(),
      },
      AccessibilityInfo: {
        addEventListener: jest.fn(() => ({ remove: jest.fn() })),
        isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)),
      },
      AppState: {
        currentState: "active",
        addEventListener: jest.fn(() => ({ remove: jest.fn() })),
      },
      Dimensions: {
        get: jest.fn(() => ({
          width: dims.width,
          height: dims.height,
          scale: 1,
          fontScale: 1,
        })),
        addEventListener: jest.fn(() => ({ remove: jest.fn() })),
      },
      Image: "Image",
      Linking: {
        openURL: jest.fn(),
      },
      Modal: "Modal",
      Platform: {
        OS: platform,
        select: (options: Record<string, unknown>) =>
          options[platform] ?? options.default,
      },
      Pressable: "Pressable",
      ScrollView: "ScrollView",
      StyleSheet: {
        absoluteFillObject: {
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        },
        create: (styles: any) => styles,
        flatten: (style: any) => style,
      },
      Text: "Text",
      TouchableOpacity: "TouchableOpacity",
      TouchableWithoutFeedback: "TouchableWithoutFeedback",
      View: "View",
      useWindowDimensions: () => ({
        width: dims.width,
        height: dims.height,
        scale: 1,
        fontScale: 1,
      }),
    }));

    jest.doMock(
      "react-native-css-interop/src/runtime/native/appearance-observables",
      () => ({
        addChangeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeChangeListener: jest.fn(),
        removeEventListener: jest.fn(),
        resetAppearanceListeners: jest.fn(),
      }),
      { virtual: true },
    );

    jest.doMock("../../lib/vector-icons", () => ({ Ionicons: "Ionicons" }));
    jest.doMock("../../lib/morph-icon", () => ({ MorphIcon: "MorphIcon" }));
    jest.doMock("lucide", () => ({
      ArrowRight: "ArrowRight",
      ArrowUpRight: "ArrowUpRight",
      ArrowUpRightFromCircle: "ArrowUpRightFromCircle",
      ChevronRight: "ChevronRight",
      CirclePlus: "CirclePlus",
      Compass: "Compass",
    }));

    jest.doMock("react-native-reanimated", () => ({
      __esModule: true,
      default: {
        View: "Reanimated.View",
        ScrollView: MockReanimatedScrollView,
      },
      Easing: {
        ease: "ease",
        inOut: (value: unknown) => value,
        out: (value: unknown) => value,
        cubic: "cubic",
      },
      Extrapolation: {
        CLAMP: "clamp",
      },
      interpolate: (
        value: number,
        inputRange: number[],
        outputRange: number[],
      ) =>
        value <= inputRange[0]
          ? outputRange[0]
          : outputRange[outputRange.length - 1],
      useAnimatedReaction: jest.fn(),
      useAnimatedScrollHandler: (handlers: any) => handlers,
      useAnimatedStyle: (factory: () => any) => factory(),
      // Real Reanimated shared values keep a stable object identity across
      // re-renders (like useRef), which matters for effects that depend on a
      // useCallback closing over one -- fake it with useRef instead of
      // returning a fresh object on every render.
      useSharedValue: (value: unknown) => React.useRef({ value }).current,
      cancelAnimation: jest.fn(),
      withDelay: (_delay: number, value: unknown) => value,
      withRepeat: (value: unknown) => value,
      withSequence: (...values: unknown[]) => values[values.length - 1],
      withSpring: (value: unknown) => value,
      withTiming: (value: unknown) => value,
    }));

    jest.doMock("react-native-safe-area-context", () => ({
      useSafeAreaInsets: () => ({
        top: topInset,
        right: 0,
        bottom: bottomInset,
        left: 0,
      }),
    }));

    jest.doMock("react-native-svg", () => ({
      __esModule: true, default: "Svg", Svg: "Svg", Circle: "Circle", Line: "Line", Path: "Path", Rect: "Rect", Text: "SvgText",
    }));

    jest.doMock("expo-haptics", () => ({
      __esModule: true,
      ImpactFeedbackStyle: {
        Light: "Light",
      },
      impactAsync: jest.fn(),
    }));

    jest.doMock("expo-router", () => ({
      usePathname: () => "/home",
      useRouter: () => ({
        push: mockRouterPush,
      }),
    }));

    jest.doMock("../../hooks/useAuth", () => ({
      useAuth: () => ({ user: null }),
    }));

    jest.doMock("../../hooks/useTheme", () => ({
      useTheme: () => ({
        colors: isDark
          ? {
              ...mockColors,
              background: {
                default: "#121212",
              },
              text: {
                ...mockColors.text,
                primary: "#ffffff",
                secondary: "#f0f0f0",
              },
            }
          : mockColors,
        isDark,
        theme: isDark ? "dark" : "light",
        setTheme: jest.fn(),
      }),
    }));

    jest.doMock("../../hooks/useIsMobile", () => ({
      useIsMobile: () => true,
    }));

    jest.doMock("../../providers/LanguageProvider", () => ({
      useLanguage: () => ({
        locale: "en",
        setLocale: jest.fn(),
      }),
    }));

    jest.doMock("../../contexts/AnimationLevelContext", () => ({
      useAnimationLevel: () => ({
        animationLevel,
        setAnimationLevel: jest.fn(),
      }),
    }));

    jest.doMock("../../i18n/i18n", () => ({
      getCurrentLocale: () => "en",
      getAvailableLocales: () => [{ code: "en", name: "english" }],
      useTranslation: () => ({
        t: (key: string, fallback?: string) =>
          key === "taglineFlipList" ? taglineFlipList : fallback || key,
      }),
    }));

    jest.doMock("../../lib/event-detector", () => ({
      getCurrentEvent: () => null,
      isGlobalEventTenant: () => true,
    }));

    jest.doMock("../../lib/hashpass-logo", () => ({
      getHashpassFooterLogo: () => 1,
      getHashpassFullLogo: () => 1,
      getHashpassStaticHeroLogo: () => 2,
    }));

    jest.doMock("../../lib/utils", () => ({
      createShadowStyle: () => ({}),
    }));

    jest.doMock("../../components/icons/SettingsIcons", () => ({
      ArrowUpIcon: "ArrowUpIcon",
      SettingsIcon: "SettingsIcon",
      LogInIcon: "LogInIcon",
      MoonIcon: "MoonIcon",
      SunIcon: "SunIcon",
      AutoIcon: "AutoIcon",
      ZapIcon: "ZapIcon",
      SliderIcon: "SliderIcon",
      PauseIcon: "PauseIcon",
      CheckIcon: "CheckIcon",
      ChevronDownIcon: "ChevronDownIcon",
      getFlagEmoji: () => "US",
    }));

    jest.doMock("../../components/Features", () => "Features");
    jest.doMock("../../components/Testimonials", () => "Testimonials");
    jest.doMock("../../components/InteractiveHoverButton", () => ({
      InteractiveHoverButton: "InteractiveHoverButton",
    }));
    jest.doMock("../../components/FlipWords", () => "FlipWords");
    jest.doMock("../../components/Newsletter", () => "Newsletter");
    jest.doMock(
      "../../components/EventBannerCarousel",
      () => "EventBannerCarousel",
    );
    jest.doMock("../../components/EventProposalModal", () => "EventProposalModal");
    jest.doMock(
      "../../components/VersionStatusIndicator",
      () => "VersionStatusIndicator",
    );
    jest.doMock(
      "../../components/CrystalForgeBackground",
      () => "CrystalForgeBackground",
    );
    jest.doMock(
      "../../components/AnimatedGradientBackground",
      () => "AnimatedGradientBackground",
    );

    const TestRenderer = require("react-test-renderer");
    const HomeScreen = require("../../app/home").default;
    ReactRef = React;
    HomeScreenRef = HomeScreen;

    actFn = TestRenderer.act;
    actFn(() => {
      renderer = TestRenderer.create(React.createElement(HomeScreen));
    });
  });

  return {
    renderer,
    act: actFn,
    dims,
    rerender: () => {
      actFn(() => {
        renderer.update(ReactRef.createElement(HomeScreenRef));
      });
    },
  };
};

const styleArrayContains = (style: unknown, matcher: Record<string, unknown>) =>
  Array.isArray(style) &&
  style.some(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      Object.entries(matcher).every(
        ([key, value]) => (entry as Record<string, unknown>)[key] === value,
      ),
  );

describe("HomeScreen native tablet layout", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockRouterPush.mockReset();
    mockScrollTo.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts at the top and reserves tablet footer space for floating controls", () => {
    const { renderer, act } = loadHomeScreen({
      width: 1200,
      height: 900,
      platform: "android",
      bottomInset: 28,
    });

    const root = renderer.root;
    const scrollView = root.findByType("Reanimated.ScrollView");

    expect(scrollView.props.contentOffset).toEqual({ x: 0, y: 0 });
    expect(scrollView.props.decelerationRate).toBe(0.985);
    expect(scrollView.props.alwaysBounceVertical).toBe(false);
    expect(scrollView.props.contentContainerStyle).toEqual(
      expect.objectContaining({ paddingBottom: 160 }),
    );

    const floatingStack = root
      .findAllByType("Reanimated.View")
      .find((node: any) =>
        styleArrayContains(node.props.style, { bottom: 116 }),
      );
    expect(floatingStack).toBeTruthy();

    const hero = root
      .findAllByType("View")
      .find(
        (node: any) =>
          node.props.style?.minHeight === 738 &&
          node.props.style?.height === 738,
      );
    expect(hero).toBeTruthy();

    const footer = root
      .findAllByType("View")
      .find((node: any) => node.props.style?.paddingBottom === 200);
    expect(footer).toBeTruthy();

    const topControls = root
      .findAllByType("Reanimated.View")
      .find(
        (node: any) =>
          styleArrayContains(node.props.style, { top: 58 }) &&
          styleArrayContains(node.props.style, { opacity: 1 }),
      );
    expect(topControls).toBeTruthy();
    expect(scrollView.props.onLayout).toBeUndefined();

    const callsBeforeLayout = mockScrollTo.mock.calls.length;
    act(() => {
      scrollView.props.onContentSizeChange?.(1200, 2200);
    });
    expect(mockScrollTo.mock.calls.length).toBeGreaterThan(callsBeforeLayout);

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(mockScrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
    expect(mockScrollTo.mock.calls.length).toBeGreaterThanOrEqual(6);
  });

  it("uses safe-area top spacing for native phone settings and login controls", () => {
    const { renderer } = loadHomeScreen({
      width: 390,
      height: 844,
      platform: "ios",
      topInset: 47,
      bottomInset: 34,
    });

    const topControls = renderer.root
      .findAllByType("Reanimated.View")
      .find(
        (node: any) =>
          styleArrayContains(node.props.style, { top: 67 }) &&
          styleArrayContains(node.props.style, { opacity: 1 }),
      );

    expect(topControls).toBeTruthy();
  });

  it("keeps event banner calls to action inside the dashboard explorer", () => {
    const { renderer, act } = loadHomeScreen({ platform: "web" });

    const carousel = renderer.root.findByType("EventBannerCarousel");
    expect(carousel.props.showCtas).toBe(false);
    expect(carousel.props.footerLeadingAction).toBeTruthy();
    expect(carousel.props.footerAction).toBeTruthy();

    const proposalAction = carousel.props.footerLeadingAction;
    const explorerAction = carousel.props.footerAction;
    expect(proposalAction.props.children[0].props.size).toBe(24);
    expect(explorerAction.props.children[0].props.size).toBe(24);
    expect(proposalAction.props.children[2].props.icon).toBe("ChevronRight");
    expect(explorerAction.props.children[2].props.icon).toBe("ChevronRight");
    expect(proposalAction.props.onMouseEnter).toEqual(expect.any(Function));

    act(() => {
      proposalAction.props.onMouseEnter();
    });

    const hoveredProposalAction = renderer.root.findByType(
      "EventBannerCarousel",
    ).props.footerLeadingAction;
    expect(hoveredProposalAction.props.children[0].props.icon).toBe(
      "ArrowUpRightFromCircle",
    );
    expect(hoveredProposalAction.props.children[2].props.icon).toBe(
      "ArrowRight",
    );

    const hoveredExplorerActionSource = renderer.root.findByType(
      "EventBannerCarousel",
    ).props.footerAction;
    expect(hoveredExplorerActionSource.props.onMouseEnter).toEqual(
      expect.any(Function),
    );

    act(() => {
      hoveredExplorerActionSource.props.onMouseEnter();
    });

    const hoveredExplorerAction = renderer.root.findByType(
      "EventBannerCarousel",
    ).props.footerAction;
    expect(hoveredExplorerAction.props.children[0].props.icon).toBe(
      "ArrowUpRight",
    );
    expect(hoveredExplorerAction.props.children[2].props.icon).toBe(
      "ArrowRight",
    );
  });

  it("keeps complete single-line carousel actions on a standard phone viewport", () => {
    const { renderer } = loadHomeScreen({
      width: 390,
      height: 844,
      platform: "web",
    });

    const carousel = renderer.root.findByType("EventBannerCarousel");
    const proposalLabel = carousel.props.footerLeadingAction.props.children[1];
    const explorerLabel = carousel.props.footerAction.props.children[1];

    expect(proposalLabel.props.children).toBe("Propose an event");
    expect(explorerLabel.props.children).toBe("Explore all events");
    expect(proposalLabel.props.numberOfLines).toBe(1);
    expect(explorerLabel.props.numberOfLines).toBe(1);
  });

  it("passes the selected motion preference into landing features", () => {
    const { renderer: reducedRenderer } = loadHomeScreen({
      platform: "web",
      animationLevel: "reduced",
    });
    expect(reducedRenderer.root.findByType("Features").props.reduceMotion).toBe(true);

    const { renderer: fullRenderer } = loadHomeScreen({
      platform: "web",
      animationLevel: "full",
    });
    expect(fullRenderer.root.findByType("Features").props.reduceMotion).toBe(false);
  });

  it("renders the native landing first frame visibly without waiting for scroll", () => {
    const { renderer } = loadHomeScreen({
      width: 390,
      height: 844,
      platform: "android",
      animationLevel: "full",
      isDark: false,
    });

    const root = renderer.root;
    const container = root
      .findAllByType("Reanimated.View")
      .find(
        (node: any) =>
          styleArrayContains(node.props.style, { position: "relative" }) &&
          styleArrayContains(node.props.style, { opacity: 1 }),
      );
    expect(container).toBeTruthy();

    const hero = root
      .findAllByType("View")
      .find((node: any) => node.props.style?.backgroundColor === "#F8FAFC");
    expect(hero).toBeTruthy();
  });

  it("renders a static single-line hero tagline with theme-aware colors when animations are disabled", () => {
    const { renderer } = loadHomeScreen({
      platform: "web",
      animationLevel: "none",
      isDark: false,
    });

    const root = renderer.root;
    const taglineText = root
      .findAllByType("Text")
      .find(
        (node: any) =>
          node.props.numberOfLines === 1 && Array.isArray(node.props.children),
      );

    expect(taglineText).toBeTruthy();
    expect(taglineText?.props.numberOfLines).toBe(1);
    expect(taglineText?.props.style).toEqual(
      expect.objectContaining({
        color: mockColors.text.primary,
      }),
    );
    for (const phrase of ["YOUR EVENT", "YOUR COMMUNITY", "YOUR REWARDS"]) {
      expect(
        root
          .findAllByType("Text")
          .some((node: any) => node.props.children === phrase),
      ).toBe(true);
    }
    const taglineDots = root
      .findAllByType("Text")
      .filter((node: any) => node.props.children === " • ");
    expect(taglineDots).toHaveLength(2);
    for (const dot of taglineDots) {
      expect(dot.props.style).toEqual(
        expect.objectContaining({
          color: mockColors.primary,
          fontWeight: "900",
        }),
      );
    }

    const heroLogo = root
      .findAllByType("Image")
      .find((node: any) => node.props.source === 2);
    expect(heroLogo).toBeTruthy();

    const scrollLabel = root
      .findAllByType("Text")
      .find((node: any) => node.props.children === "Scroll");
    expect(
      styleArrayContains(scrollLabel?.props.style, {
        color: mockColors.text.primary,
      }),
    ).toBe(true);

    const arrowPath = root
      .findAllByType("Path")
      .find((node: any) => node.props.stroke);
    expect(arrowPath?.props.stroke).toBe(mockColors.text.primary);
  });

  it("does not snap the scroll position back to top when the mobile browser toolbar collapses (regression)", () => {
    // Regression: the initial-scroll-reset effect used to list
    // windowHeight/windowWidth in its dependency array even though it never
    // reads either value. Mobile Chrome/Safari fire a resize (toolbar
    // collapse/expand) while the user is actively scrolling, which retriggers
    // the effect and calls resetScrollPosition() -- jumping the page back to
    // the top mid-scroll. windowHeight/windowWidth must not be able to
    // retrigger this effect on their own.
    const { renderer, act, dims, rerender } = loadHomeScreen({
      platform: "web",
      width: 390,
      height: 844,
    });

    act(() => {
      jest.runOnlyPendingTimers();
    });

    mockScrollTo.mockClear();

    dims.width = 390;
    dims.height = 760; // simulates the browser toolbar collapsing mid-scroll
    rerender();

    expect(mockScrollTo).not.toHaveBeenCalled();
    void renderer;
  });
});
