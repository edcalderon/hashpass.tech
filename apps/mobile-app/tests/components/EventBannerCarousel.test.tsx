import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Platform, ScrollView, TextInput, TouchableOpacity } from "react-native";

const mockEvent = {
  id: "hash-poker",
  shortName: "Hash Poker",
  color: "#00B8D4",
  eventStartDate: "2026-10-01T19:00:00Z",
} as any;

const mockWeekEvent = {
  id: "cbweek2026",
  shortName: "Colombia Blockchain Week",
  title: "Colombia Blockchain Week 2026",
  subtitle: "Medellín, Colombia",
  aliases: ["CBW", "Blockchain Week"],
  color: "#00B8D4",
  eventStartDate: "2026-12-11T19:00:00Z",
} as any;

const mockEvents = [mockEvent, mockWeekEvent];
let mockIsMobile = true;
let mockThemeIsDark = true;
let mockTranslate = (
  _namespace: string | undefined,
  _key: string,
  fallback: string,
) => fallback;

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
    isDark: mockThemeIsDark,
    colors: { primary: "#00B8D4" },
  }),
}));
jest.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => mockIsMobile }));
jest.mock("../../i18n/i18n", () => ({
  useTranslation: (namespace?: string) => ({
    t: (key: string, fallback: string) => mockTranslate(namespace, key, fallback),
  }),
}));
jest.mock("../../components/EventBanner", () => "EventBanner");
jest.mock("../../components/LampBrandBanner", () => "LampBrandBanner");
jest.mock("../../components/SafeLinearGradient", () => "SafeLinearGradient");
jest.mock("../../components/CarouselTickPill", () => "CarouselTickPill");
jest.mock("../../contexts/AnimationLevelContext", () => ({
  useAnimationLevel: () => ({ animationLevel: "none" }),
}));
jest.mock("../../lib/morph-icon", () => ({ MorphIcon: "MorphIcon" }));
jest.mock("lucide", () => ({
  ChevronLeft: "ChevronLeft",
  ChevronRight: "ChevronRight",
  Compass: "Compass",
  Search: "Search",
}));
jest.mock("../../lib/event-detector", () => ({
  getAvailableEvents: () => mockEvents,
  isGlobalEventTenant: () => true,
}));
jest.mock("../../lib/event-branding", () => ({ getLampBrandConfig: () => undefined }));
jest.mock("../../lib/event-banners", () => ({
  getEventBannerSlides: () => mockBanners,
  localizeEventBannerSlide: (banner: unknown) => banner,
  shouldShowEventBannerCountdown: () => false,
}));

import EventBannerCarousel, {
  resolveCarouselCardHeight,
} from "../../components/EventBannerCarousel";
import {
  getVisibleCarouselDotIndices,
  resolveMobileCarouselCardWidth,
  shouldStackCarouselFooter,
} from "../../lib/carousel-layout";

let view: ReactTestRenderer;
let scrollTo: jest.Mock;
const originalPlatform = Platform.OS;
const originalRaf = global.requestAnimationFrame;
const originalCancelRaf = global.cancelAnimationFrame;

beforeEach(() => {
  (Platform as { OS: string }).OS = "android";
  mockIsMobile = true;
  mockThemeIsDark = true;
  mockTranslate = (_namespace, _key, fallback) => fallback;
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

it("uses a compact, content-safe card height on native phone widths", () => {
  expect(resolveCarouselCardHeight(true, 360)).toBe(420);
  expect(resolveCarouselCardHeight(true, 412)).toBe(448);
  expect(resolveCarouselCardHeight(false, 1024)).toBe(540);
});

it("keeps each mobile card inside its exact-width paging page", () => {
  expect(resolveMobileCarouselCardWidth(320)).toBe(288);
  expect(resolveMobileCarouselCardWidth(360)).toBe(328);
  expect(resolveMobileCarouselCardWidth(412)).toBe(380);
});

it("stacks carousel actions before indicators on medium web widths", () => {
  expect(shouldStackCarouselFooter(false, 1024, "web")).toBe(true);
  expect(shouldStackCarouselFooter(false, 1200, "web")).toBe(false);
  expect(shouldStackCarouselFooter(true, 1200, "android")).toBe(true);
});

it("keeps mobile pagination bounded while retaining the active card in view", () => {
  expect(getVisibleCarouselDotIndices(12, 0)).toEqual([0, 1, 2, 3, 4]);
  expect(getVisibleCarouselDotIndices(12, 6)).toEqual([4, 5, 6, 7, 8]);
  expect(getVisibleCarouselDotIndices(12, 11)).toEqual([7, 8, 9, 10, 11]);
});

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

it("adds an organizer proposal card with a working call to action", () => {
  const onProposeEvent = jest.fn();
  render({ autoPlay: false, showProposalCard: true, onProposeEvent });

  const proposal = view.root.findAllByProps({
    accessibilityLabel: "Propose an event",
  }).find((node) => node.props.accessibilityRole === "button")!;
  expect(proposal.props.accessibilityRole).toBe("button");

  act(() => proposal.props.onPress());
  expect(onProposeEvent).toHaveBeenCalledTimes(1);
});

it("uses a rich red light treatment without changing the cyan dark treatment", () => {
  mockThemeIsDark = false;
  render({ autoPlay: false, showProposalCard: true });

  const lightCard = view.root.findByProps({ testID: "carousel-proposal-card" });
  expect(lightCard.props.colors).toEqual(["#FFF1F2", "#FECACA", "#FFE4E6"]);

  act(() => view.unmount());
  mockThemeIsDark = true;
  render({ autoPlay: false, showProposalCard: true });

  const darkCard = view.root.findByProps({ testID: "carousel-proposal-card" });
  expect(darkCard.props.colors).toEqual(["#07111F", "#102A38", "#0D1724"]);
});

it("does not open the proposal modal after a peeking-card drag", () => {
  (Platform as { OS: string }).OS = "web";
  mockIsMobile = false;
  const onProposeEvent = jest.fn();
  render({ autoPlay: false, showProposalCard: true, onProposeEvent });

  const scroll = view.root.findByType(ScrollView);
  act(() => {
    scroll.props.onPointerDown({ pointerType: "mouse", clientX: 320, currentTarget: { style: {} } });
    scroll.props.onPointerMove({ clientX: 280 });
    scroll.props.onPointerUp({ currentTarget: { style: {} } });
  });

  const proposal = view.root.findAllByProps({
    accessibilityLabel: "Your event belongs here",
  })[0];
  act(() => proposal.props.onPress());
  expect(onProposeEvent).not.toHaveBeenCalled();
});

it("uses the landing namespace for proposal-card copy", () => {
  mockTranslate = (namespace, key, fallback) => (
    namespace === "index" && key === "eventProposal.cardTitle"
      ? "Tu evento pertenece aquí"
      : fallback
  );
  render({ autoPlay: false, showProposalCard: true });

  expect(view.root.findByProps({ children: "Tu evento pertenece aquí" })).toBeTruthy();
});

it("ranks the closest event first when a visitor searches", () => {
  const { rankEventsForCarousel } = require("../../components/EventBannerCarousel");

  expect(rankEventsForCarousel(mockEvents, "blockchain week").map((event: any) => event.id))
    .toEqual(["cbweek2026", "hash-poker"]);
});

it("uses a compact search trigger that expands only while searching", () => {
  (Platform as { OS: string }).OS = "web";
  mockIsMobile = false;
  render({ autoPlay: false, showEventSearch: true, onExploreEvents: jest.fn() });

  const trigger = view.root.findByProps({ testID: "carousel-search-trigger" });
  const input = view.root.findByProps({ testID: "carousel-search-input" });

  expect(trigger.props.accessibilityLabel).toBe("Search events in the carousel");
  expect(typeof trigger.props.onPress).toBe("function");
  expect(typeof input.props.onFocus).toBe("function");
  expect(typeof input.props.onBlur).toBe("function");
  expect(input.props.style).toEqual(expect.objectContaining({
    backgroundColor: "transparent",
    borderColor: "transparent",
    outlineColor: "transparent",
    caretColor: "#A5F3FC",
  }));
  expect(input.props.className).toBe("hp-carousel-search-input");
});

it("expands the circular explorer action before opening all events", () => {
  (Platform as { OS: string }).OS = "web";
  mockIsMobile = false;
  const onExploreEvents = jest.fn();
  render({ autoPlay: false, showEventSearch: true, onExploreEvents });

  const trigger = view.root.findByProps({
    testID: "carousel-explorer-expand-trigger",
  });
  expect(trigger.props.label).toBe("Explore all events");

  act(() => trigger.props.onMouseEnter());

  const action = view.root.findByProps({ testID: "carousel-explorer-action" });
  act(() => action.props.onPress());
  expect(onExploreEvents).toHaveBeenCalledTimes(1);
});

it("keeps search expanded and explorer labelled on phone-sized web", () => {
  (Platform as { OS: string }).OS = "web";
  mockIsMobile = true;
  const onExploreEvents = jest.fn();
  render({ autoPlay: false, showEventSearch: true, onExploreEvents });

  const search = view.root.findAllByProps({ testID: "carousel-search-input" });
  const searchInput = search.find((node) => node.type === TextInput);
  const explorer = view.root.findAllByProps({
    testID: "carousel-explorer-expand-trigger",
  });

  expect(searchInput).toBeTruthy();
  expect(searchInput?.props.placeholder).toBe("Search by name, reference or #hashtag");
  expect(searchInput?.props.accessibilityLabel).toBe("Search events in the carousel");
  expect(explorer.length).toBeGreaterThan(0);
  expect(explorer[0].props.label).toBe("Explore all");
  expect(explorer[0].props.accessibilityLabel).toBe("Explore all events");

  const footer = view.root.findByProps({ testID: "carousel-footer" });
  expect(footer.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ flexDirection: "column" })]),
  );
  expect(view.root.findByProps({ testID: "carousel-mobile-direction-controls" })).toBeTruthy();
  expect(view.root.findByProps({ testID: "carousel-mobile-pager" })).toBeTruthy();

  const playToggle = view.root.findByProps({ testID: "carousel-mobile-play-toggle" });
  const restart = view.root.findByProps({ testID: "carousel-mobile-restart" });
  expect(playToggle.props.label).toBe("Play carousel");
  expect(restart.props.label).toBe("Return to first slide");
  act(() => restart.props.onPress());
  expect(scrollTo).toHaveBeenLastCalledWith({ x: 0, animated: true });

  act(() => explorer[0].props.onPress());
  expect(onExploreEvents).toHaveBeenCalledTimes(1);
});

it("ships proposal-card and carousel-search copy in every landing locale", () => {
  for (const locale of ["en", "es", "ko", "fr", "pt", "de"]) {
    const messages = require(`../../i18n/locales/${locale}.json`);
    expect(messages.index.eventProposal.cardEyebrow).toEqual(expect.any(String));
    expect(messages.index.eventProposal.cardTitle).toEqual(expect.any(String));
    expect(messages.index.eventProposal.cardBody).toEqual(expect.any(String));
    expect(messages.index.eventSearch.placeholder).toEqual(expect.any(String));
    expect(messages.index.eventSearch.mobilePlaceholder).toEqual(expect.any(String));
    expect(messages.index.eventSearch.accessibilityLabel).toEqual(expect.any(String));
    expect(messages.index.eventSearch.exploreAll).toEqual(expect.any(String));
    expect(messages.index.eventSearch.exploreAllLabel).toEqual(expect.any(String));
    expect(messages.index.eventSearch.pause).toEqual(expect.any(String));
    expect(messages.index.eventSearch.play).toEqual(expect.any(String));
    expect(messages.index.eventSearch.restart).toEqual(expect.any(String));
  }
});

it("keeps phone carousel actions visible in their own row", () => {
  render({
    event: mockEvent,
    autoPlay: false,
    showDotIndicators: true,
    footerLeadingAction: <TouchableOpacity accessibilityLabel="Propose an event" />,
    footerAction: <TouchableOpacity accessibilityLabel="Explore all events" />,
  });

  const actions = view.root.findByProps({ testID: "carousel-footer-actions" });
  const footer = view.root.findByProps({ testID: "carousel-footer" });
  expect(actions.props.style).toEqual(
    expect.objectContaining({ flexDirection: "row", width: "100%" }),
  );
  expect(footer.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ flexDirection: "column" })]),
  );
  expect(actions.findAllByType(TouchableOpacity)).toHaveLength(2);
  expect(
    view.root.findByProps({ testID: "carousel-footer-indicators" }),
  ).toBeTruthy();
});
