import {campaignFilmsAt, parseEventVideoCampaign} from "../../lib/event-video-campaign";
import {resolveCampaignManifestUrl} from "../../lib/event-video-campaign";
import {Platform} from "react-native";
import type {EventVideoCampaignFilm} from "../../types/event-video-campaign";

const origin = "https://media.example";
const base = `${origin}/events/colombia2026/branding/campaign/bsl-bogota-2026/`;
const manifest = {
  version: 1 as const,
  campaignId: "bsl-bogota-2026",
  eventId: "colombia2026",
  closesAt: "2026-11-06T23:00:00.000Z",
  metricsCutoff: null,
  films: (["welcome", "walkthrough", "recap"] as const).map((id) => ({
    id,
    title: id,
    durationMs: id === "welcome" ? 50000 : id === "walkthrough" ? 30000 : 90000,
    url: `${base}${id}.mp4`,
    poster: `${base}${id}.jpg`,
    captions: `${base}${id}.vtt`,
  })),
};

test("switches all pre-close films to the recap at exactly 18:00 Bogotá", () => {
  const parsed = parseEventVideoCampaign(manifest, "colombia2026", origin);
  expect(parsed).not.toBeNull();
  expect(campaignFilmsAt(parsed!, Date.parse(manifest.closesAt) - 1).map((film: EventVideoCampaignFilm) => film.id)).toEqual(["welcome", "walkthrough"]);
  expect(campaignFilmsAt(parsed!, Date.parse(manifest.closesAt)).map((film: EventVideoCampaignFilm) => film.id)).toEqual(["recap"]);
});

test("rejects another event, another origin, unsafe media and malformed timing", () => {
  expect(parseEventVideoCampaign({...manifest, eventId: "other"}, "colombia2026", origin)).toBeNull();
  expect(parseEventVideoCampaign({...manifest, closesAt: "bad"}, "colombia2026", origin)).toBeNull();
  expect(parseEventVideoCampaign({...manifest, films: manifest.films.map((film) => ({...film, url: "https://other.example/video.mp4"}))}, "colombia2026", origin)).toBeNull();
  expect(parseEventVideoCampaign({...manifest, films: manifest.films.map((film) => ({...film, durationMs: 0}))}, "colombia2026", origin)).toBeNull();
});

describe("localised welcome film", () => {
  const track = (language: string, name: string) => ({src: `${base}welcome-${name}.vtt`, language, label: name});
  const alternate = {
    title: "Welcome to BSL Bogotá",
    durationMs: 50000,
    url: `${base}welcome-en.mp4`,
    poster: `${base}welcome-en.jpg`,
    captions: `${base}welcome-en.vtt`,
    captionTracks: [{...track("en", "en"), default: true}, track("es", "es")],
  };
  const withWelcome = (change: Record<string, unknown>) => ({
    ...manifest,
    films: manifest.films.map((film) => (film.id === "welcome" ? {...film, ...change} : film)),
  });

  test("accepts same-origin alternate locales and caption tracks", () => {
    const parsed = parseEventVideoCampaign(withWelcome({alternateLocales: {en: alternate}, captionTracks: alternate.captionTracks}), "colombia2026", origin);
    expect(parsed?.films.find((film: EventVideoCampaignFilm) => film.id === "welcome")?.alternateLocales?.en?.url).toBe(alternate.url);
  });

  test.each([
    ["an unknown alternate locale", {alternateLocales: {fr: alternate}}],
    ["a non-object alternate locales value", {alternateLocales: "en"}],
    ["an alternate on another origin", {alternateLocales: {en: {...alternate, url: "https://other.example/events/colombia2026/branding/campaign/x.mp4"}}}],
    ["an alternate with an invalid duration", {alternateLocales: {en: {...alternate, durationMs: 0}}}],
    ["an empty caption track list", {captionTracks: []}],
    ["a caption track list that is not an array", {captionTracks: "en"}],
    ["a caption track in an unsupported language", {captionTracks: [track("fr", "fr")]}],
    ["a caption track without a label", {captionTracks: [{src: `${base}x.vtt`, language: "en", label: ""}]}],
    ["a caption track outside the campaign path", {captionTracks: [{src: `${origin}/other/x.vtt`, language: "en", label: "English"}]}],
    ["a film without a title", {title: ""}],
  ])("rejects %s", (_name, change) => {
    expect(parseEventVideoCampaign(withWelcome(change), "colombia2026", origin)).toBeNull();
  });
});

test("uses a same-origin campaign manifest during local web development", () => {
  const originalPlatform = Platform.OS;
  const originalEnvironment = process.env.EXPO_PUBLIC_ENV;
  try {
    Platform.OS = "web";
    process.env.EXPO_PUBLIC_ENV = "local";
    const testGlobal = globalThis as unknown as Record<string, unknown>;
    testGlobal.window = {
      location: {origin: "http://192.168.1.20:8081", protocol: "http:"},
    };

    expect(resolveCampaignManifestUrl("https://production-media.example/hero.mp4")?.toString()).toBe(
      "http://192.168.1.20:8081/events/colombia2026/branding/campaign/bsl-bogota-2026/manifest.json",
    );
  } finally {
    Platform.OS = originalPlatform;
    if (originalEnvironment === undefined) delete process.env.EXPO_PUBLIC_ENV;
    else process.env.EXPO_PUBLIC_ENV = originalEnvironment;
    delete (globalThis as unknown as Record<string, unknown>).window;
  }
});

test("keeps explicit and production manifest overrides deterministic", () => {
  const originalExplicit = process.env.EXPO_PUBLIC_EVENT_VIDEO_MANIFEST_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEnvironment = process.env.EXPO_PUBLIC_ENV;
  const originalPlatform = Platform.OS;
  const testGlobal = globalThis as unknown as Record<string, unknown>;
  const originalDev = testGlobal.__DEV__;
  try {
    process.env.EXPO_PUBLIC_EVENT_VIDEO_MANIFEST_URL = "https://media.example/custom.json";
    expect(resolveCampaignManifestUrl("https://production-media.example/hero.mp4")?.toString()).toBe(
      "https://media.example/custom.json",
    );

    process.env.EXPO_PUBLIC_EVENT_VIDEO_MANIFEST_URL = "not a url";
    expect(resolveCampaignManifestUrl("https://production-media.example/hero.mp4")).toBeNull();

    delete process.env.EXPO_PUBLIC_EVENT_VIDEO_MANIFEST_URL;
    process.env.NODE_ENV = "production";
    process.env.EXPO_PUBLIC_ENV = "production";
    Platform.OS = "web";
    testGlobal.__DEV__ = false;
    testGlobal.window = {location: {origin: "https://hashpass.tech", protocol: "https:"}};
    expect(resolveCampaignManifestUrl("https://production-media.example/hero.mp4")?.toString()).toBe(
      "https://production-media.example/campaign/bsl-bogota-2026/manifest.json",
    );

    Platform.OS = "android";
    delete testGlobal.window;
    testGlobal.__DEV__ = true;
    expect(resolveCampaignManifestUrl("https://production-media.example/hero.mp4")).toBeNull();
  } finally {
    Platform.OS = originalPlatform;
    if (originalExplicit === undefined) delete process.env.EXPO_PUBLIC_EVENT_VIDEO_MANIFEST_URL;
    else process.env.EXPO_PUBLIC_EVENT_VIDEO_MANIFEST_URL = originalExplicit;
    if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalEnvironment === undefined) delete process.env.EXPO_PUBLIC_ENV;
    else process.env.EXPO_PUBLIC_ENV = originalEnvironment;
    if (originalDev === undefined) delete testGlobal.__DEV__;
    else testGlobal.__DEV__ = originalDev;
    delete testGlobal.window;
  }
});
