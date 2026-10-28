import {useEffect, useState} from "react";
import {AppState, Platform} from "react-native";
import {parseEventVideoCampaign} from "../lib/event-video-campaign";
import type {EventVideoCampaign} from "../types/event-video-campaign";

export function useEventVideoCampaign(eventId?: string, heroVideo?: string) {
  const [campaign, setCampaign] = useState<EventVideoCampaign | null>(null);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    setCampaign(null);
    if (eventId !== "colombia2026" || !heroVideo) return;
    const manifestUrl = resolveCampaignManifestUrl(heroVideo);
    if (!manifestUrl) return;
    let cancelled = false;
    let controller: AbortController | undefined;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 8000);
      try {
        const response = await fetch(manifestUrl, {signal: controller.signal});
        if (!response.ok) return;
        const parsed = parseEventVideoCampaign(await response.json(), eventId, manifestUrl.origin);
        if (!cancelled && parsed) setCampaign(parsed);
      } catch { /* Keep the canonical event hero on media/network failure. */ }
      finally { clearTimeout(timeout); }
    };
    void load();
    const poll = setInterval(() => { setNow(Date.now()); if (AppState.currentState === "active") void load(); }, 30_000);
    const appState = AppState.addEventListener("change", (state) => { if (state === "active") { setNow(Date.now()); void load(); } });
    return () => { cancelled = true; controller?.abort(); clearInterval(poll); appState.remove(); };
  }, [eventId, heroVideo]);

  useEffect(() => {
    if (!campaign) return;
    const delay = Date.parse(campaign.closesAt) - Date.now();
    if (delay <= 0 || delay > 2_147_483_647) return;
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [campaign, now]);

  return {campaign: campaign?.eventId === eventId ? campaign : null, now};
}

const LOCAL_WEB_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i;

export function resolveCampaignManifestUrl(heroVideo: string): URL | null {
  const explicitManifestUrl = String(process.env.EXPO_PUBLIC_EVENT_VIDEO_MANIFEST_URL || "").trim();
  if (explicitManifestUrl) {
    try { return new URL(explicitManifestUrl); } catch { return null; }
  }

  const isLocalWeb = Platform.OS === "web" && typeof window !== "undefined" && (
    LOCAL_WEB_ORIGIN.test(window.location.origin) ||
    (window.location.protocol === "http:" && process.env.NODE_ENV !== "production" && process.env.EXPO_PUBLIC_ENV !== "production")
  );
  if (isLocalWeb) {
    // Local web development must never derive a request from the production
    // hero URL. A missing local fixture is intentionally handled as a normal
    // fallback to the canonical event hero.
    return new URL("/events/colombia2026/branding/campaign/bsl-bogota-2026/manifest.json", window.location.origin);
  }

  // Native development has no local HTTP origin to serve campaign media from;
  // keep the existing hero and avoid a request to production S3.
  if (typeof __DEV__ !== "undefined" && __DEV__) return null;

  try { return new URL("campaign/bsl-bogota-2026/manifest.json", heroVideo); } catch { return null; }
}
