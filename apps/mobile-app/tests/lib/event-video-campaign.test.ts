import {campaignFilmsAt, parseEventVideoCampaign} from "../../lib/event-video-campaign";

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
  expect(campaignFilmsAt(parsed!, Date.parse(manifest.closesAt) - 1).map((film) => film.id)).toEqual(["welcome", "walkthrough"]);
  expect(campaignFilmsAt(parsed!, Date.parse(manifest.closesAt)).map((film) => film.id)).toEqual(["recap"]);
});

test("rejects another event, another origin, unsafe media and malformed timing", () => {
  expect(parseEventVideoCampaign({...manifest, eventId: "other"}, "colombia2026", origin)).toBeNull();
  expect(parseEventVideoCampaign({...manifest, closesAt: "bad"}, "colombia2026", origin)).toBeNull();
  expect(parseEventVideoCampaign({...manifest, films: manifest.films.map((film) => ({...film, url: "https://other.example/video.mp4"}))}, "colombia2026", origin)).toBeNull();
  expect(parseEventVideoCampaign({...manifest, films: manifest.films.map((film) => ({...film, durationMs: 0}))}, "colombia2026", origin)).toBeNull();
});
