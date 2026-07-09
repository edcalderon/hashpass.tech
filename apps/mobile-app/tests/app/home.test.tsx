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
  bottomInset = 28,
  animationLevel = "reduced",
  isDark = false,
  taglineFlipList = "- YOUR EVENT -,- YOUR COMMUNITY -,- YOUR REWARDS -",
}: {
  width?: number;
  height?: number;
  platform?: "android" | "ios" | "web";
  bottomInset?: number;
  animationLevel?: "full" | "reduced" | "none";
  isDark?: boolean;
  taglineFlipList?: string;
} = {}) => {
  let renderer: any;
  let actFn: any;

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
        get: jest.fn(() => ({ width, height, scale: 1, fontScale: 1 })),
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
      useWindowDimensions: () => ({ width, height, scale: 1, fontScale: 1 }),
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

    jest.doMock("react-native-reanimated", () => ({
      __esModule: true,
      default: {
        View: "Reanimated.View",
        ScrollView: MockReanimatedScrollView,
      },
      Easing: {
        ease: "ease",
        inOut: (value: unknown) => value,
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
      useSharedValue: (value: unknown) => ({ value }),
      withDelay: (_delay: number, value: unknown) => value,
      withRepeat: (value: unknown) => value,
      withSequence: (...values: unknown[]) => values[values.length - 1],
      withSpring: (value: unknown) => value,
      withTiming: (value: unknown) => value,
    }));

    jest.doMock("react-native-safe-area-context", () => ({
      useSafeAreaInsets: () => ({
        top: 0,
        right: 0,
        bottom: bottomInset,
        left: 0,
      }),
    }));

    jest.doMock("react-native-svg", () => ({
      Svg: "Svg",
      Path: "Path",
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

    actFn = TestRenderer.act;
    actFn(() => {
      renderer = TestRenderer.create(React.createElement(HomeScreen));
    });
  });

  return { renderer, act: actFn };
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
          node.props.style?.minHeight === 560 &&
          node.props.style?.height === 560,
      );
    expect(hero).toBeTruthy();

    const footer = root
      .findAllByType("View")
      .find((node: any) => node.props.style?.paddingBottom === 200);
    expect(footer).toBeTruthy();

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(mockScrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
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
          node.props.children === "- YOUR EVENT YOUR COMMUNITY YOUR REWARDS -",
      );

    expect(taglineText).toBeTruthy();
    expect(taglineText?.props.numberOfLines).toBe(1);
    expect(taglineText?.props.style).toEqual(
      expect.objectContaining({
        color: mockColors.text.primary,
      }),
    );

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
});
