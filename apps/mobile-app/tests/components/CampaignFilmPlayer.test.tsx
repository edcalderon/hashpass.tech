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

  describe("web locale selection", () => {
    const english = {
      title: "Welcome to BSL Bogotá (EN)",
      durationMs: 50_000,
      url: "https://media.example/events/colombia2026/branding/campaign/welcome-en.mp4",
      poster: "https://media.example/events/colombia2026/branding/campaign/welcome-en.jpg",
      captions: "https://media.example/events/colombia2026/branding/campaign/welcome-en.vtt",
      captionTracks: [
        {src: "https://media.example/events/colombia2026/branding/campaign/welcome-en.vtt", language: "en" as const, label: "English", default: true},
        {src: "https://media.example/events/colombia2026/branding/campaign/welcome-es.vtt", language: "es" as const, label: "Español"},
      ],
    };
    const localised = {...film, alternateLocales: {en: english}};
    const originalLanguage = Object.getOwnPropertyDescriptor(globalThis.navigator ?? {}, "language");
    const setLanguage = (language: string) => Object.defineProperty(globalThis, "navigator", {value: {language}, configurable: true});
    const render = (value: typeof localised | typeof film) => {
      let renderer!: ReturnType<typeof create>;
      act(() => {
        renderer = create(<WebCampaignFilmPlayer film={value} />, {createNodeMock: () => ({pause: jest.fn()})});
      });
      return renderer;
    };
    afterEach(() => {
      if (originalLanguage) Object.defineProperty(globalThis.navigator, "language", originalLanguage);
      else Reflect.deleteProperty(globalThis, "navigator");
    });

    it("plays the English alternate with every caption track for English browsers", () => {
      setLanguage("en-US");
      const root = render(localised).root;
      expect(root.findByType("video" as never).props).toMatchObject({src: english.url, poster: english.poster, "aria-label": english.title});
      const tracks = root.findAllByType("track" as never);
      expect(tracks.map((track) => track.props.srcLang)).toEqual(["en", "es"]);
      expect(tracks[0].props.default).toBe(true);
    });

    it("keeps the default film for other languages and without an alternate", () => {
      setLanguage("es-CO");
      expect(render(localised).root.findByType("video" as never).props.src).toBe(film.url);
      setLanguage("en-US");
      expect(render(film).root.findByType("video" as never).props.src).toBe(film.url);
    });

    it("falls back to the default film when the browser language is unavailable", () => {
      Reflect.deleteProperty(globalThis, "navigator");
      expect(render(localised).root.findByType("video" as never).props.src).toBe(film.url);
    });
  });
});
