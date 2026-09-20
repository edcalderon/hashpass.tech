/* eslint-disable @typescript-eslint/no-require-imports, import/first */
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

let mockAnimationLevel: "full" | "none" = "full";

jest.mock("react-native", () => {
  const ReactRef = require("react");
  return {
    Appearance: {
      getColorScheme: () => "light",
      addChangeListener: () => ({ remove: jest.fn() }),
    },
    AppState: {
      currentState: "active",
      addEventListener: () => ({ remove: jest.fn() }),
    },
    Dimensions: {
      get: () => ({ width: 390, height: 844, scale: 1, fontScale: 1 }),
      addEventListener: () => ({ remove: jest.fn() }),
    },
    Platform: { OS: "android", select: (options: Record<string, unknown>) => options.android ?? options.default },
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(false),
      addEventListener: () => ({ remove: jest.fn() }),
    },
    StyleSheet: { create: (styles: unknown) => styles },
    Text: "Text",
    TouchableOpacity: "TouchableOpacity",
    View: "View",
    useWindowDimensions: () => ({ width: 390, height: 844 }),
    __ReactRef: ReactRef,
  };
});
jest.mock("react-native-reanimated", () => {
  const ReactRef = require("react");
  return {
    __esModule: true,
    default: { View: "Animated.View" },
    FadeIn: { duration: () => "FadeIn" },
    cancelAnimation: jest.fn(),
    useAnimatedReaction: jest.fn(
      (prepare: () => unknown, react: (value: unknown, previous: unknown) => void) =>
        react(prepare(), undefined),
    ),
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: (value: unknown) => ReactRef.useRef({ value }).current,
    withDelay: (_delay: number, value: unknown) => value,
    withRepeat: (value: unknown) => value,
    withSequence: (...values: unknown[]) => values.at(-1),
    withTiming: (value: unknown) => value,
  };
});
jest.mock("../../hooks/useTheme", () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock("../../i18n/i18n", () => ({
  useTranslation: () => ({ t: (key: string, fallback: string) => fallback || key }),
}));
jest.mock("../../contexts/AnimationLevelContext", () => ({
  useAnimationLevel: () => ({ animationLevel: mockAnimationLevel }),
}));
jest.mock("../../components/LandingBadge", () => "LandingBadge");
jest.mock("../../components/HowItWorksIllustration", () => "HowItWorksIllustration");
jest.mock("../../lib/morph-icon", () => ({ MorphIcon: "MorphIcon" }));
jest.mock("lucide", () => ({ Info: "Info", X: "X" }));

// Resolve the native component explicitly because the web variant has its own
// motion implementation and coverage path.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const HowItWorks = require("../../components/HowItWorks.tsx").default;

let view: ReactTestRenderer;

afterEach(() => {
  act(() => view?.unmount());
  mockAnimationLevel = "full";
});

it("renders the native product scenes after reduced-motion state resolves", async () => {
  await act(async () => {
    view = create(<HowItWorks scrollY={{ value: 0 }} />);
    await Promise.resolve();
  });

  expect(view.root.findAllByType("HowItWorksIllustration" as any)).toHaveLength(4);
  expect(view.root.findAllByType("Text" as any).map(node => node.props.children)).toContain(
    "How HASHPASS Works",
  );
});

it("keeps native cards static when motion is disabled", async () => {
  mockAnimationLevel = "none";
  await act(async () => {
    view = create(<HowItWorks />);
    await Promise.resolve();
  });

  expect(view.root.findAllByType("HowItWorksIllustration" as any)).toHaveLength(4);
});

it("expands a native card only after its information control is pressed", async () => {
  await act(async () => {
    view = create(<HowItWorks />);
    await Promise.resolve();
  });

  expect(view.root.findAllByType("Text" as any).map(node => node.props.children)).not.toContain(
    "Skip the line. Your pass is a live QR code that gets you into any event instantly — no printouts, no paperwork.",
  );
  act(() => {
    view.root.findAllByProps({ accessibilityRole: "button" })[0].props.onPress();
  });

  expect(view.root.findAllByType("Text" as any).map(node => node.props.children)).toContain(
    "Skip the line. Your pass is a live QR code that gets you into any event instantly — no printouts, no paperwork.",
  );
});
