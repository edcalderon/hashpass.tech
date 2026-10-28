import {Platform} from "react-native";
import type {EventVideoCampaign, EventVideoCampaignCaptionTrack, EventVideoCampaignFilm, EventVideoCampaignFilmMedia} from "../types/event-video-campaign";

const CAMPAIGN_PATH = "/events/colombia2026/branding/campaign/";

export function preferredCampaignPlayback(film: EventVideoCampaignFilm, locale: string): EventVideoCampaignFilmMedia {
  const language = locale.trim().toLowerCase().split(/[-_]/, 1)[0];
  return language === "en" && film.alternateLocales?.en ? film.alternateLocales.en : film;
}
const LOCAL_WEB_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i;

export function resolveCampaignManifestUrl(heroVideo: string): URL | null {
  const explicitManifestUrl = String(process.env.EXPO_PUBLIC_EVENT_VIDEO_MANIFEST_URL || "").trim();
  if (explicitManifestUrl) {
    try { return new URL(explicitManifestUrl); } catch { return null; }
  }

  const browserOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const browserProtocol = typeof window !== "undefined" ? window.location.protocol : "";
  const isLocalWeb = Platform.OS === "web" && typeof window !== "undefined" && (
    LOCAL_WEB_ORIGIN.test(browserOrigin) ||
    (browserProtocol === "http:" && process.env.NODE_ENV !== "production" && process.env.EXPO_PUBLIC_ENV !== "production")
  );
  if (isLocalWeb) {
    // Local web development must never derive a request from the production
    // hero URL. A missing local fixture is intentionally handled as a normal
    // fallback to the canonical event hero.
    return new URL("/events/colombia2026/branding/campaign/bsl-bogota-2026/manifest.json", browserOrigin);
  }

  // Native development has no local HTTP origin to serve campaign media from;
  // keep the existing hero and avoid a request to production S3.
  if (typeof __DEV__ !== "undefined" && __DEV__) return null;

  try { return new URL("campaign/bsl-bogota-2026/manifest.json", heroVideo); } catch { return null; }
}

export function parseEventVideoCampaign(value: unknown, eventId: string, origin: string): EventVideoCampaign | null {
  if (!value || typeof value !== "object") return null;
  const campaign = value as EventVideoCampaign;
  if (campaign.version !== 1 || campaign.eventId !== eventId || !campaign.campaignId || !Number.isFinite(Date.parse(campaign.closesAt))) return null;
  if (!Array.isArray(campaign.films) || campaign.films.length !== 3) return null;
  const ids = new Set<EventVideoCampaignFilm["id"]>(campaign.films.map((film) => film.id));
  const requiredIds: EventVideoCampaignFilm["id"][] = ["welcome", "walkthrough", "recap"];
  if (ids.size !== 3 || !requiredIds.every((id) => ids.has(id))) return null;

  const hasSafeMedia = (media: EventVideoCampaignFilmMedia): boolean => {
    if (!media || !Number.isFinite(media.durationMs) || media.durationMs < 1000 || media.durationMs > 180000) return false;
    const captionTracks = media.captionTracks;
    if (captionTracks && (!Array.isArray(captionTracks) || captionTracks.length === 0 || captionTracks.some((track: EventVideoCampaignCaptionTrack) => !track || !["en", "es"].includes(track.language) || !track.label || !track.src))) return false;
    const urls = [media.url, media.poster, media.captions, ...(captionTracks ?? []).map((track) => track.src)];
    return urls.every((mediaUrl) => {
      try {
        const parsed = new URL(mediaUrl);
        const localHttpOrigin = parsed.protocol === "http:" && /^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(parsed.origin);
        return (parsed.protocol === "https:" || localHttpOrigin) && parsed.origin === origin && parsed.pathname.startsWith(CAMPAIGN_PATH);
      } catch { return false; }
    });
  };

  for (const film of campaign.films) {
    if (!film || !film.title || !hasSafeMedia(film)) return null;
    if (film.alternateLocales) {
      if (typeof film.alternateLocales !== "object") return null;
      for (const [locale, alternate] of Object.entries(film.alternateLocales)) {
        if (!["en", "es"].includes(locale) || !hasSafeMedia(alternate as EventVideoCampaignFilmMedia)) return null;
      }
    }
  }
  return campaign;
}

export function campaignFilmsAt(campaign: EventVideoCampaign, now: number): EventVideoCampaignFilm[] {
  return now >= Date.parse(campaign.closesAt)
    ? campaign.films.filter((film) => film.id === "recap")
    : campaign.films.filter((film) => film.id !== "recap");
}
