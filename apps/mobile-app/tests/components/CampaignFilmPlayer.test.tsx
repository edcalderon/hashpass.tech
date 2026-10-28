import React from "react";
import {AppState, type AppStateStatus} from "react-native";
import {act, create} from "react-test-renderer";
import NativeCampaignFilmPlayer from "../../components/CampaignFilmPlayer.native";
import WebCampaignFilmPlayer from "../../components/CampaignFilmPlayer.web";

const mockPlayer = {
  loop: true,
  muted: true,
  pause: jest.fn(),
};
const mockUseVideoPlayer = jest.fn(
  (source: string, setup: (player: typeof mockPlayer) => void) => {
    setup(mockPlayer);
    return mockPlayer;
  },
);

jest.mock("expo-video", () => ({
  VideoView: "VideoView",
  useVideoPlayer: (...args: Parameters<typeof mockUseVideoPlayer>) =>
    mockUseVideoPlayer(...args),
}));

const film = {
  id: "welcome" as const,
  title: "Welcome to BSL Bogotá",
  durationMs: 50_000,
  url: "https://media.example/events/colombia2026/branding/campaign/welcome.mp4",
  poster: "https://media.example/events/colombia2026/branding/campaign/welcome.jpg",
  captions: "https://media.example/events/colombia2026/branding/campaign/welcome.vtt",
};

describe("CampaignFilmPlayer", () => {
  beforeEach(() => {
    mockPlayer.loop = true;
    mockPlayer.muted = true;
    mockPlayer.pause.mockClear();
    mockUseVideoPlayer.mockClear();
  });

  it("configures the native player and pauses it on background and unmount", () => {
    let appStateListener: ((state: AppStateStatus) => void) | undefined;
    const removeListener = jest.fn();
    jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
      appStateListener = listener;
      return {remove: removeListener} as never;
    });

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<NativeCampaignFilmPlayer film={film} />);
    });

    expect(mockUseVideoPlayer).toHaveBeenCalledWith(film.url, expect.any(Function));
    expect(mockPlayer).toMatchObject({loop: false, muted: false});
    expect(renderer.root.findByType("VideoView" as never).props).toMatchObject({
      accessibilityLabel: film.title,
      contentFit: "contain",
      nativeControls: true,
    });

    act(() => appStateListener?.("background"));
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);

    act(() => renderer.unmount());
    expect(mockPlayer.pause).toHaveBeenCalledTimes(2);
    expect(removeListener).toHaveBeenCalledTimes(1);
  });

  it("renders an accessible web video and reports playback errors", () => {
    const video = {pause: jest.fn()};
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<WebCampaignFilmPlayer film={film} />, {
        createNodeMock: (element) => (element.type === "video" ? video : null),
      });
    });

    const videoNode = renderer.root.findByType("video" as never);
    expect(videoNode.props).toMatchObject({
      "aria-label": film.title,
      controls: true,
      playsInline: true,
      poster: film.poster,
      src: film.url,
    });
    expect(videoNode.findByType("track" as never).props).toMatchObject({
      kind: "subtitles",
      src: film.captions,
    });

    act(() => videoNode.props.onError());
    expect(renderer.root.findByProps({accessibilityRole: "alert"})).toBeTruthy();

    expect(() => act(() => renderer.unmount())).not.toThrow();
  });
});
