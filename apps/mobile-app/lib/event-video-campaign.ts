import {Platform} from "react-native";
import type {EventVideoCampaign, EventVideoCampaignFilm} from "../types/event-video-campaign";

const CAMPAIGN_PATH = "/events/colombia2026/branding/campaign/";
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
  for (const film of campaign.films) {
    if (!film || !Number.isFinite(film.durationMs) || film.durationMs < 1000 || film.durationMs > 180000 || !film.title) return null;
    for (const media of [film.url, film.poster, film.captions]) {
      try {
        const parsed = new URL(media);
        const localHttpOrigin = parsed.protocol === "http:" && /^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(parsed.origin);
        if ((parsed.protocol !== "https:" && !localHttpOrigin) || parsed.origin !== origin || !parsed.pathname.startsWith(CAMPAIGN_PATH)) return null;
      } catch { return null; }
    }
  }
  return campaign;
}

export function campaignFilmsAt(campaign: EventVideoCampaign, now: number): EventVideoCampaignFilm[] {
  return now >= Date.parse(campaign.closesAt)
    ? campaign.films.filter((film) => film.id === "recap")
    : campaign.films.filter((film) => film.id !== "recap");
}
