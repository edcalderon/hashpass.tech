import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Platform, ScrollView, TouchableOpacity } from "react-native";

const mockEvent = {
  id: "hash-poker",
  shortName: "Hash Poker",
  color: "#00B8D4",
  eventStartDate: "2026-10-01T19:00:00Z",
} as any;

const mockBanners = ["first", "second"].map((id) => ({
  id,
  title: `Banner ${id}`,
  subtitle: "Hash House Club",
  date: "October 1, 2026",
  backgroundColor: "#07111F",
  media: { type: "image", url: "https://example.test/banner.jpg" },
}));

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: true,
    colors: { primary: "#00B8D4" },
  }),
}));
jest.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => true }));
jest.mock("../../i18n/i18n", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
jest.mock("../../components/EventBanner", () => "EventBanner");
jest.mock("../../components/LampBrandBanner", () => "LampBrandBanner");
jest.mock("../../components/SafeLinearGradient", () => "SafeLinearGradient");
jest.mock("../../components/CarouselTickPill", () => "CarouselTickPill");
jest.mock("../../lib/event-detector", () => ({
  getAvailableEvents: () => [mockEvent],
  isGlobalEventTenant: () => true,
}));
jest.mock("../../lib/event-branding", () => ({ getLampBrandConfig: () => undefined }));
jest.mock("../../lib/event-banners", () => ({
  getEventBannerSlides: () => mockBanners,
  localizeEventBannerSlide: (banner: unknown) => banner,
  shouldShowEventBannerCountdown: () => false,
}));

import EventBannerCarousel from "../../components/EventBannerCarousel";

let view: ReactTestRenderer;
let scrollTo: jest.Mock;
const originalPlatform = Platform.OS;
const originalRaf = global.requestAnimationFrame;
const originalCancelRaf = global.cancelAnimationFrame;

beforeEach(() => {
  (Platform as { OS: string }).OS = "android";
  scrollTo = jest.fn();
  global.requestAnimationFrame = jest.fn(() => 0);
  global.cancelAnimationFrame = jest.fn();
});

afterEach(() => {
  if (view) act(() => view.unmount());
  (Platform as { OS: string }).OS = originalPlatform;
  global.requestAnimationFrame = originalRaf;
  global.cancelAnimationFrame = originalCancelRaf;
  jest.useRealTimers();
});

function render(props: React.ComponentProps<typeof EventBannerCarousel>) {
  act(() => {
    view = create(<EventBannerCarousel {...props} />, {
      createNodeMock: (node) => (node.type === ScrollView ? { scrollTo } : null),
    });
  });
}

it("advances the native pager by one viewport and wraps after the final slide", () => {
  jest.useFakeTimers();
  render({ event: mockEvent, autoPlay: true, autoPlayInterval: 100 });

  act(() => { jest.advanceTimersByTime(100); });
  expect(scrollTo).toHaveBeenLastCalledWith({ x: 1024, animated: true });

  act(() => { jest.advanceTimersByTime(100); });
  expect(scrollTo).toHaveBeenLastCalledWith({ x: 0, animated: true });
});

it("keeps native campaign slides accessible and connected to their event action", () => {
  const onEventPress = jest.fn();
  render({ autoPlay: false, onEventPress });

  const campaign = view.root.findByProps({
    accessibilityLabel: "Explore Hash Poker Room at Hash House Club",
  });
  expect(campaign.type).toBe(TouchableOpacity);
  expect(campaign.props.accessibilityRole).toBe("button");

  act(() => campaign.props.onPress());
  expect(onEventPress).toHaveBeenCalledWith(mockEvent);
});
