import {renderHook, act, waitFor} from "@testing-library/react-native";
import {AppState} from "react-native";
import {useEventVideoCampaign} from "../../hooks/useEventVideoCampaign";

const manifest = {
  version: 1 as const,
  campaignId: "bsl-bogota-2026",
  eventId: "colombia2026",
  closesAt: "2026-11-06T23:00:00.000Z",
  metricsCutoff: null,
  films: [
    {
      id: "welcome" as const,
      title: "Welcome",
      durationMs: 50_000,
      url: "https://media.example/events/colombia2026/branding/campaign/welcome.mp4",
      poster: "https://media.example/events/colombia2026/branding/campaign/welcome.jpg",
      captions: "https://media.example/events/colombia2026/branding/campaign/welcome.vtt",
    },
    {
      id: "walkthrough" as const,
      title: "Walkthrough",
      durationMs: 30_000,
      url: "https://media.example/events/colombia2026/branding/campaign/walkthrough.mp4",
      poster: "https://media.example/events/colombia2026/branding/campaign/walkthrough.jpg",
      captions: "https://media.example/events/colombia2026/branding/campaign/walkthrough.vtt",
    },
    {
      id: "recap" as const,
      title: "Recap",
      durationMs: 90_000,
      url: "https://media.example/events/colombia2026/branding/campaign/recap.mp4",
      poster: "https://media.example/events/colombia2026/branding/campaign/recap.jpg",
      captions: "https://media.example/events/colombia2026/branding/campaign/recap.vtt",
    },
  ],
};

describe("useEventVideoCampaign", () => {
  const originalManifestUrl = process.env.EXPO_PUBLIC_EVENT_VIDEO_MANIFEST_URL;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_EVENT_VIDEO_MANIFEST_URL =
      "https://media.example/events/colombia2026/branding/campaign/bsl-bogota-2026/manifest.json";
    jest.spyOn(AppState, "addEventListener").mockReturnValue({remove: jest.fn()} as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalManifestUrl === undefined) delete process.env.EXPO_PUBLIC_EVENT_VIDEO_MANIFEST_URL;
    else process.env.EXPO_PUBLIC_EVENT_VIDEO_MANIFEST_URL = originalManifestUrl;
  });

  it("loads the campaign and refreshes when the app becomes active", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => manifest,
    } as Response);
    const {result, unmount} = renderHook(() =>
      useEventVideoCampaign("colombia2026", "https://media.example/hero.mp4"),
    );

    await waitFor(() => expect(result.current.campaign?.campaignId).toBe("bsl-bogota-2026"));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/manifest.json");
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeTruthy();

    const listener = jest.mocked(AppState.addEventListener).mock.calls[0]?.[1];
    await act(async () => {
      listener?.("active");
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    unmount();
    expect(AppState.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("stays on the canonical hero when the manifest is unavailable and cleans up", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({ok: false} as Response);
    const {result, rerender, unmount} = renderHook(
      ({eventId, heroVideo}: {eventId?: string; heroVideo?: string}) =>
        useEventVideoCampaign(eventId, heroVideo),
      {initialProps: {eventId: "colombia2026", heroVideo: "https://media.example/hero.mp4"}},
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(result.current.campaign).toBeNull();

    rerender({eventId: "other-event", heroVideo: "https://media.example/hero.mp4"});
    expect(result.current.campaign).toBeNull();
    unmount();
  });
});
