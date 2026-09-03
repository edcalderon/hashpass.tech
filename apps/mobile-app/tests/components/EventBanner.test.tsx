/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */

import React from "react";
import { act, create } from "react-test-renderer";
import EventBanner from "../../components/EventBanner";

const mockRouterPush = jest.fn();

jest.mock("react-native", () => {
  return {
    Appearance: {
      getColorScheme: () => "light",
      addChangeListener: jest.fn(),
    },
    AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(false),
      addEventListener: jest.fn(),
    },
    Animated: {
      View: "Animated.View",
      sequence: () => ({ start: jest.fn() }),
      timing: () => ({ start: jest.fn() }),
      Value: class {
        value: number;

        constructor(value: number) {
          this.value = value;
        }
      },
    },
    Image: "Image",
    ImageBackground: "ImageBackground",
    Linking: { openURL: jest.fn(() => Promise.resolve()) },
    StatusBar: { currentHeight: 0 },
    StyleSheet: { create: (styles: unknown) => styles },
    Text: "Text",
    TouchableOpacity: "TouchableOpacity",
    View: "View",
  };
});

jest.mock("react-native-css-interop/jsx-runtime", () =>
  require("react/jsx-runtime"),
);

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      primary: "#C81000",
      background: { paper: "#07111F" },
      text: { primary: "#FFFFFF", secondary: "#B8C1CC" },
      border: "#1E2B3B",
    },
  }),
}));

let mockIsLoggedIn = false;
jest.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ isLoggedIn: mockIsLoggedIn }),
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));
jest.mock("../../i18n/i18n", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
jest.mock("../../lib/event-detector", () => ({ isMainBranch: true }));
jest.mock("../../lib/event-branding", () => ({
  getTourBrandAsset: () => null,
  getEventBadgeAsset: () => null,
  resolveEventImageSource: (image?: string) =>
    image ? { uri: image } : undefined,
}));
jest.mock("../../lib/vector-icons", () => ({ MaterialIcons: "MaterialIcons" }));
jest.mock("../../components/AgendaTracker", () => "AgendaTracker");
jest.mock(
  "../../components/EventBannerBackgroundVideo",
  () => "EventBannerBackgroundVideo",
);
jest.mock("../../components/SafeLinearGradient", () => "SafeLinearGradient");
jest.mock("../../lib/banner-cta", () => ({
  getEventBannerCtaLayout: () => ({
    position: "absolute",
    right: 20,
    bottom: 20,
  }),
}));

describe("EventBanner", () => {
  beforeEach(() => {
    mockRouterPush.mockReset();
    mockIsLoggedIn = false;
  });

  it("sends a logged-out visitor to the event's public info page, not the protected dashboard (regression)", () => {
    // Regression: this button used to always push straight to
    // /(shared)/dashboard/explore regardless of auth state -- a real
    // protected-route leak reachable from a finished/archived event banner
    // on the public landing page.
    mockIsLoggedIn = false;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <EventBanner
          title="BSL 2025"
          subtitle="Medellín"
          date="November 2025"
          eventId="bsl2025"
          isEventFinished
        />,
      );
    });

    const button = renderer!.root.findByProps({
      testID: "event-banner-explore-more",
    });
    act(() => button.props.onPress());

    expect(mockRouterPush).toHaveBeenCalledWith("/events/bsl2025/event-info");
    act(() => renderer!.unmount());
  });

  it("sends a logged-in visitor to the dashboard explorer", () => {
    mockIsLoggedIn = true;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <EventBanner
          title="BSL 2025"
          subtitle="Medellín"
          date="November 2025"
          eventId="bsl2025"
          isEventFinished
        />,
      );
    });

    const button = renderer!.root.findByProps({
      testID: "event-banner-explore-more",
    });
    act(() => button.props.onPress());

    expect(mockRouterPush).toHaveBeenCalledWith("/(shared)/dashboard/explore");
    act(() => renderer!.unmount());
  });

  it("shows film media while allowing a host to suppress its campaign CTA", () => {
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <EventBanner
          title="Cripto Latin Fest 2026"
          subtitle="Maloka, Bogotá · 9th Edition"
          date="August 27–28, 2026"
          eventId="criptolatinfest"
          eventLabel="CLF 2026 · Official film"
          eventShortName="CLF"
          eventImage="https://cdn.example/clf-logo.webp"
          eventVideo="https://cdn.example/clf-film.mp4"
          ctaLabel="Explore Cripto Latin Fest"
          ctaUrl="/events/criptolatinfest/home"
          showCta={false}
        />,
      );
    });

    expect(
      renderer!.root.findByType("EventBannerBackgroundVideo" as any).props,
    ).toMatchObject({
      source: "https://cdn.example/clf-film.mp4",
      loadingLogo: "https://cdn.example/clf-logo.webp",
      loadingLabel: "Loading event film",
    });
    expect(
      renderer!.root.findAllByProps({
        accessibilityLabel: "Explore Cripto Latin Fest",
      }),
    ).toHaveLength(0);
    act(() => renderer!.unmount());
  });

  it("never puts unapproved campaign artwork behind readable banner copy", () => {
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <EventBanner
          title="Colombia Blockchain Week 2026"
          subtitle="Hotel InterContinental Medellín"
          date="December 11-12, 2026"
          eventImage="https://cdn.example/cbw-flyer-with-title.jpg"
        />,
      );
    });

    expect(renderer!.root.findAllByType("ImageBackground" as any)).toHaveLength(
      0,
    );
    act(() => renderer!.unmount());
  });

  it("renders and follows an internal CTA when the owning surface enables it", () => {
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <EventBanner
          title="Cripto Latin Fest 2026"
          subtitle="Maloka, Bogotá"
          date="August 27–28, 2026"
          ctaLabel="Explore Cripto Latin Fest"
          ctaUrl="/events/criptolatinfest/home"
        />,
      );
    });

    const cta = renderer!.root.findByProps({
      accessibilityLabel: "Explore Cripto Latin Fest",
    });
    act(() => cta.props.onPress());

    expect(mockRouterPush).toHaveBeenCalledWith("/events/criptolatinfest/home");
    act(() => renderer!.unmount());
  });
});
