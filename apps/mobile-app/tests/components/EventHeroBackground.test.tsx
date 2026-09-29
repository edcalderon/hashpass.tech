/// <reference types="jest" />

import React from "react";
import { act, create } from "react-test-renderer";
import { AccessibilityInfo } from "react-native";
import EventHeroBackground from "../../components/explorer/EventHeroBackground";

jest.mock("../../components/EventBannerBackgroundVideo", () => "EventBannerBackgroundVideo");
jest.mock("expo-video", () => ({
  VideoView: "VideoView",
  useVideoPlayer: () => ({
    loop: false,
    muted: false,
    pause: jest.fn(),
    play: jest.fn(),
  }),
}));

const render = (element: React.ReactElement) => {
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(element);
  });
  return renderer!;
};

describe("EventHeroBackground", () => {
  const textureStyle = { opacity: 0.32 };
  const mediaStyle = { opacity: 0.84 };
  let reducedMotionPreference: jest.SpyInstance;

  beforeEach(() => {
    // Most assertions inspect the synchronous shell. Keep the asynchronous OS
    // preference pending unless a test intentionally resolves it inside act().
    reducedMotionPreference = jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockImplementation(() => new Promise<boolean>(() => {}));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("keeps the event poster visible behind a hero film", () => {
    const renderer = render(
      <EventHeroBackground
        fallbackImage="https://media.example/events/colombia2026/hero.jpg"
        videoSource="https://media.example/events/colombia2026/hero.mp4"
        loadingLogo="https://media.example/events/colombia2026/logo.webp"
        loadingLabel="Loading event film"
        mediaStyle={mediaStyle}
        textureStyle={textureStyle}
      />,
    );

    expect(renderer.root.findByType("Image" as any).props.source).toEqual({
      uri: "https://media.example/events/colombia2026/hero.jpg",
    });
    expect(renderer.root.findByType("EventBannerBackgroundVideo" as any).props).toMatchObject({
      source: "https://media.example/events/colombia2026/hero.mp4",
      showLoadingIndicator: false,
      loadingLabel: "Loading event film",
    });
    expect(renderer.root.findAllByProps({ testID: "event-hero-stripe-fallback" })).toHaveLength(0);
  });

  it("disables hero-film playback when reduced motion is enabled", async () => {
    reducedMotionPreference.mockResolvedValue(true);
    const renderer = render(
      <EventHeroBackground
        fallbackImage="https://media.example/events/colombia2026/hero.jpg"
        videoSource="https://media.example/events/colombia2026/hero.mp4"
        loadingLabel="Loading event film"
        mediaStyle={mediaStyle}
        textureStyle={textureStyle}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      renderer.root.findByType("EventBannerBackgroundVideo" as any).props
        .playbackEnabled,
    ).toBe(false);
  });

  it("keeps the stripe fallback when an event has no usable poster", () => {
    const renderer = render(
      <EventHeroBackground
        videoSource="https://media.example/events/legacy/hero.mp4"
        loadingLabel="Loading event film"
        mediaStyle={mediaStyle}
        textureStyle={textureStyle}
      />,
    );

    expect(renderer.root.findAllByType("Image" as any)).toHaveLength(0);
    expect(renderer.root.findByType("EventBannerBackgroundVideo" as any).props.showLoadingIndicator).toBe(true);
    expect(renderer.root.findAllByProps({ testID: "event-hero-stripe-fallback" })).toHaveLength(1);
  });

  it("adds the subtle moving texture to an image-only hero", () => {
    const renderer = render(
      <EventHeroBackground
        fallbackImage="https://media.example/events/legacy/hero.jpg"
        loadingLabel="Loading event film"
        mediaStyle={mediaStyle}
        textureStyle={textureStyle}
      />,
    );

    expect(renderer.root.findByType("Image" as any).props.source).toEqual({
      uri: "https://media.example/events/legacy/hero.jpg",
    });
    expect(
      renderer.root.findAllByType("EventBannerBackgroundVideo" as any),
    ).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({ testID: "event-hero-stripe-fallback" }),
    ).toHaveLength(1);
  });

  it("cleans up safely when a renderer has no motion subscription", () => {
    const renderer = render(
      <EventHeroBackground
        fallbackImage="https://media.example/events/legacy/hero.jpg"
        loadingLabel="Loading event film"
        mediaStyle={mediaStyle}
        textureStyle={textureStyle}
      />,
    );

    expect(() => {
      act(() => renderer.unmount());
    }).not.toThrow();
  });
});
