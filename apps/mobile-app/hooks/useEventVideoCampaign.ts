import {useEffect, useState} from "react";
import {AppState} from "react-native";
import {parseEventVideoCampaign, resolveCampaignManifestUrl} from "../lib/event-video-campaign";
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
