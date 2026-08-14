/// <reference types="jest" />

import React from "react";
import { act, create } from "react-test-renderer";
import NativeEventBannerBackgroundVideo from "../../components/EventBannerBackgroundVideo.native";
import WebEventBannerBackgroundVideo from "../../components/EventBannerBackgroundVideo.web";

const mockNativePlayer = { loop: false, muted: false, play: jest.fn() };
const mockUseVideoPlayer = jest.fn(
  (source: unknown, setup: (player: typeof mockNativePlayer) => void) => {
    setup(mockNativePlayer);
    return { source };
  },
);

jest.mock("expo-video", () => ({
  VideoView: "VideoView",
  useVideoPlayer: (...args: Parameters<typeof mockUseVideoPlayer>) =>
    mockUseVideoPlayer(...args),
}));

type VideoEvent = "canplay" | "loadeddata";

const createWebVideo = (
  readyState = 0,
  play: () => unknown = () => Promise.resolve(),
) => {
  const listeners = new Map<VideoEvent, () => void>();
  return {
    readyState,
    muted: false,
    defaultMuted: false,
    play: jest.fn(play),
    addEventListener: jest.fn((event: VideoEvent, callback: () => void) => {
      listeners.set(event, callback);
    }),
    removeEventListener: jest.fn((event: VideoEvent) => {
      listeners.delete(event);
    }),
    emit: (event: VideoEvent) => listeners.get(event)?.(),
  };
};

const render = (
  element: React.ReactElement,
  options?: Parameters<typeof create>[1],
) => {
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(element, options);
  });
  return renderer!;
};

describe("EventBannerBackgroundVideo", () => {
  beforeEach(() => {
    mockNativePlayer.loop = false;
    mockNativePlayer.muted = false;
    mockNativePlayer.play.mockClear();
    mockUseVideoPlayer.mockClear();
    Object.defineProperty(global, "HTMLMediaElement", {
      configurable: true,
      value: { HAVE_CURRENT_DATA: 2 },
    });
  });

  it("keeps the native CLF loader visible until the first video frame", () => {
    const renderer = render(
      <NativeEventBannerBackgroundVideo
        source="https://cdn.example/clf.mp4"
        loadingLogo="https://cdn.example/clf-logo.webp"
        loadingLabel="Loading CLF film"
      />,
    );

    expect(mockNativePlayer).toMatchObject({ loop: true, muted: true });
    expect(mockNativePlayer.play).toHaveBeenCalledTimes(1);
    expect(
      renderer.root.findByProps({ accessibilityLabel: "Loading CLF film" }),
    ).toBeTruthy();

    act(() => {
      renderer.root.findByType("VideoView" as any).props.onFirstFrameRender();
    });

    expect(
      renderer.root.findAllByProps({ accessibilityLabel: "Loading CLF film" }),
    ).toHaveLength(0);
  });

  it("autoplays web video and swaps the branded loader after loaded data", () => {
    const video = createWebVideo();
    const renderer = render(
      <WebEventBannerBackgroundVideo
        source="https://cdn.example/clf.mp4"
        loadingLogo="https://cdn.example/clf-logo.webp"
        loadingLabel="Loading CLF film"
      />,
      {
        createNodeMock: (element) => (element.type === "video" ? video : null),
      },
    );

    expect(video.play).toHaveBeenCalledTimes(1);
    expect(video).toMatchObject({ muted: true, defaultMuted: true });
    expect(
      renderer.root.findByProps({ "aria-label": "Loading CLF film" }),
    ).toBeTruthy();

    act(() => {
      video.emit("loadeddata");
    });

    expect(video.play).toHaveBeenCalledTimes(2);
    expect(
      renderer.root.findAllByProps({ "aria-label": "Loading CLF film" }),
    ).toHaveLength(0);

    act(() => renderer.unmount());
    expect(video.removeEventListener).toHaveBeenCalledWith(
      "canplay",
      expect.any(Function),
    );
    expect(video.removeEventListener).toHaveBeenCalledWith(
      "loadeddata",
      expect.any(Function),
    );
  });

  it("uses the bundled CLF film on native instead of relying on the remote URL", () => {
    render(
      <NativeEventBannerBackgroundVideo
        source="https://cdn.example/clf.mp4"
        preferBundledSource
      />,
    );

    expect(mockUseVideoPlayer.mock.calls[0]?.[0]).not.toBe(
      "https://cdn.example/clf.mp4",
    );
  });

  it("reveals ready web video immediately when playback does not return a promise", () => {
    const video = createWebVideo(2, () => undefined);
    const renderer = render(
      <WebEventBannerBackgroundVideo source="https://cdn.example/clf.mp4" />,
      {
        createNodeMock: (element) => (element.type === "video" ? video : null),
      },
    );

    expect(video.play).toHaveBeenCalledTimes(2);
    expect(
      renderer.root.findAllByProps({ "aria-label": "Loading event film" }),
    ).toHaveLength(0);
  });
});
